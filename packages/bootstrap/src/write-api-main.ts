import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { type Database, Spanner } from "@google-cloud/spanner";
import {
  type GroupChat,
  type GroupChatEvent,
  type GroupChatId,
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import {
  type CommandContext,
  GroupChatRepository,
  createCommandSchema,
} from "cqrs-es-example-js-command-interface-adaptor-impl";
import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-processor";
import { EventStore } from "event-store-adapter-js";
import { logger } from "./index";

type GroupChatEventStore = EventStore<GroupChatId, GroupChat, GroupChatEvent>;

const SUPPORTED_BACKENDS = ["dynamodb", "spanner"] as const;
type PersistenceBackend = (typeof SUPPORTED_BACKENDS)[number];

function env(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : defaultValue;
}

function resolveBackend(): PersistenceBackend {
  const raw = process.env.PERSISTENCE_BACKEND;
  if (raw === "dynamodb" || raw === "spanner") {
    return raw;
  }
  throw new Error(
    `Unsupported PERSISTENCE_BACKEND: ${JSON.stringify(
      raw,
    )}. Supported backends are: ${SUPPORTED_BACKENDS.join(", ")}.`,
  );
}

function createDynamoDBEventStore(): GroupChatEventStore {
  const journalTableName = env("PERSISTENCE_JOURNAL_TABLE_NAME", "journal");
  const snapshotTableName = env("PERSISTENCE_SNAPSHOT_TABLE_NAME", "snapshot");
  const journalAidIndexName = env(
    "PERSISTENCE_JOURNAL_AID_INDEX_NAME",
    "journal-aid-index",
  );
  const snapshotAidIndexName = env(
    "PERSISTENCE_SNAPSHOT_AID_INDEX_NAME",
    "snapshot-aid-index",
  );
  const snapshotActiveTtlIndexName = env(
    "PERSISTENCE_SNAPSHOT_ACTIVE_TTL_INDEX_NAME",
    "snapshot-active-ttl-index",
  );
  const shardCount = Number.parseInt(env("PERSISTENCE_SHARD_COUNT", "32"), 10);

  const awsRegion = process.env.AWS_REGION;
  const awsDynamodbEndpointUrl = process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const awsDynamodbAccessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const awsDynamodbSecretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

  logger.info(`PERSISTENCE_JOURNAL_TABLE_NAME: ${journalTableName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_TABLE_NAME: ${snapshotTableName}`);
  logger.info(`PERSISTENCE_JOURNAL_AID_INDEX_NAME: ${journalAidIndexName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_AID_INDEX_NAME: ${snapshotAidIndexName}`);
  logger.info(
    `PERSISTENCE_SNAPSHOT_ACTIVE_TTL_INDEX_NAME: ${snapshotActiveTtlIndexName}`,
  );
  logger.info(`PERSISTENCE_SHARD_COUNT: ${shardCount}`);
  logger.info(`AWS_REGION: ${awsRegion}`);
  logger.info(`AWS_DYNAMODB_ENDPOINT_URL: ${awsDynamodbEndpointUrl}`);

  const dynamodbClient =
    awsRegion &&
    awsDynamodbEndpointUrl &&
    awsDynamodbAccessKeyId &&
    awsDynamodbSecretAccessKey
      ? new DynamoDBClient({
          region: awsRegion,
          endpoint: awsDynamodbEndpointUrl,
          credentials: {
            accessKeyId: awsDynamodbAccessKeyId,
            secretAccessKey: awsDynamodbSecretAccessKey,
          },
        })
      : new DynamoDBClient();

  return EventStore.createDynamoDB<GroupChatId, GroupChat, GroupChatEvent>({
    client: dynamodbClient,
    journalTableName,
    snapshotTableName,
    journalAidIndexName,
    snapshotAidIndexName,
    snapshotActiveTtlIndexName,
    shardCount,
    eventConverter: convertJSONToGroupChatEvent,
    snapshotConverter: convertJSONToGroupChat,
  });
}

function createSpannerEventStore(): GroupChatEventStore {
  const journalTableName = env("PERSISTENCE_JOURNAL_TABLE_NAME", "journal");
  const snapshotTableName = env("PERSISTENCE_SNAPSHOT_TABLE_NAME", "snapshot");
  const shardCount = Number.parseInt(env("PERSISTENCE_SHARD_COUNT", "32"), 10);
  const projectId = env("PERSISTENCE_SPANNER_PROJECT_ID", "local-project");
  const instanceId = env("PERSISTENCE_SPANNER_INSTANCE_ID", "local-instance");
  const databaseId = env("PERSISTENCE_SPANNER_DATABASE_ID", "local-database");

  logger.info(`PERSISTENCE_JOURNAL_TABLE_NAME: ${journalTableName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_TABLE_NAME: ${snapshotTableName}`);
  logger.info(`PERSISTENCE_SHARD_COUNT: ${shardCount}`);
  logger.info(`PERSISTENCE_SPANNER_PROJECT_ID: ${projectId}`);
  logger.info(`PERSISTENCE_SPANNER_INSTANCE_ID: ${instanceId}`);
  logger.info(`PERSISTENCE_SPANNER_DATABASE_ID: ${databaseId}`);
  logger.info(`SPANNER_EMULATOR_HOST: ${process.env.SPANNER_EMULATOR_HOST}`);

  // The Spanner SDK automatically targets the emulator when
  // SPANNER_EMULATOR_HOST is set in the environment.
  const spanner = new Spanner({ projectId });
  const database: Database = spanner.instance(instanceId).database(databaseId);

  return EventStore.createSpanner<GroupChatId, GroupChat, GroupChatEvent>({
    database,
    journalTableName,
    snapshotTableName,
    shardCount,
    eventConverter: convertJSONToGroupChatEvent,
    snapshotConverter: convertJSONToGroupChat,
  });
}

function createEventStore(backend: PersistenceBackend): GroupChatEventStore {
  switch (backend) {
    case "dynamodb":
      return createDynamoDBEventStore();
    case "spanner":
      return createSpannerEventStore();
    default: {
      const exhaustive: never = backend;
      throw new Error(`Unsupported backend: ${String(exhaustive)}`);
    }
  }
}

async function writeApiMain() {
  const apiHost = env("API_HOST", "localhost");
  const apiPort = Number.parseInt(env("API_PORT", "3000"), 10);
  const backend = resolveBackend();

  logger.info("Starting write API server");
  logger.info(`API_HOST: ${apiHost}`);
  logger.info(`API_PORT: ${apiPort}`);
  logger.info(`PERSISTENCE_BACKEND: ${backend}`);

  const eventStore = createEventStore(backend);
  const groupChatRepository =
    GroupChatRepository.create(eventStore).withRetention(100);
  const groupChatCommandProcessor =
    GroupChatCommandProcessor.create(groupChatRepository);

  const schema = await createCommandSchema();
  const server = new ApolloServer<CommandContext>({ schema });
  const { url } = await startStandaloneServer(server, {
    context: async (): Promise<CommandContext> => ({
      groupChatCommandProcessor,
    }),
    listen: { host: apiHost, port: apiPort },
  });
  logger.info(`🚀 Server ready at ${url}`);
}

export { writeApiMain };
