import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import { type Database, Spanner } from "@google-cloud/spanner";
import type {
  GroupChat,
  GroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import {
  type CommandContext,
  GroupChatRepository,
  createCommandSchema,
  groupChatEventSerializer,
  groupChatSnapshotSerializer,
} from "cqrs-es-example-js-command-interface-adaptor-impl";
import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-processor";
import { EventStore } from "event-store-adapter-js";
import { SpannerEventStore } from "event-store-adapter-js/spanner";
import { logger } from "./index";

type GroupChatEventStore = EventStore<GroupChatEvent, GroupChat>;

const SUPPORTED_BACKENDS = ["dynamodb", "spanner"] as const;
type PersistenceBackend = (typeof SUPPORTED_BACKENDS)[number];

function env(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : defaultValue;
}

function resolveBackend(): PersistenceBackend {
  const raw = process.env.PERSISTENCE_BACKEND ?? "dynamodb";
  if (raw === "") {
    return "dynamodb";
  }
  if (raw === "dynamodb" || raw === "spanner") {
    return raw;
  }
  throw new Error(
    `Unsupported PERSISTENCE_BACKEND: ${JSON.stringify(
      raw,
    )}. Supported backends are: ${SUPPORTED_BACKENDS.join(", ")}.`,
  );
}

async function createDynamoDBEventStore(): Promise<GroupChatEventStore> {
  const journalTableName = env("PERSISTENCE_JOURNAL_TABLE_NAME", "journal");
  const snapshotTableName = env("PERSISTENCE_SNAPSHOT_TABLE_NAME", "snapshot");
  const headTableName = env("PERSISTENCE_HEAD_TABLE_NAME", "head");
  const snapshotHistoryIndexName = env(
    "PERSISTENCE_SNAPSHOT_HISTORY_INDEX_NAME",
    "snapshot-history-index",
  );

  const awsRegion = process.env.AWS_REGION;
  const awsDynamodbEndpointUrl = process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const awsDynamodbAccessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const awsDynamodbSecretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

  logger.info(`PERSISTENCE_JOURNAL_TABLE_NAME: ${journalTableName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_TABLE_NAME: ${snapshotTableName}`);
  logger.info(`PERSISTENCE_HEAD_TABLE_NAME: ${headTableName}`);
  logger.info(
    `PERSISTENCE_SNAPSHOT_HISTORY_INDEX_NAME: ${snapshotHistoryIndexName}`,
  );
  logger.info(`AWS_REGION: ${awsRegion}`);
  logger.info(`AWS_DYNAMODB_ENDPOINT_URL: ${awsDynamodbEndpointUrl}`);

  // Apply each setting independently: a configured endpoint (e.g. LocalStack)
  // must still take effect when explicit credentials are not provided. The AWS
  // SDK v3 does not pick up AWS_DYNAMODB_ENDPOINT_URL on its own.
  const dynamodbConfig: DynamoDBClientConfig = {};
  if (awsRegion) {
    dynamodbConfig.region = awsRegion;
  }
  if (awsDynamodbEndpointUrl) {
    dynamodbConfig.endpoint = awsDynamodbEndpointUrl;
  }
  if (awsDynamodbAccessKeyId && awsDynamodbSecretAccessKey) {
    dynamodbConfig.credentials = {
      accessKeyId: awsDynamodbAccessKeyId,
      secretAccessKey: awsDynamodbSecretAccessKey,
    };
  }
  const dynamodbClient = new DynamoDBClient(dynamodbConfig);

  const result = await EventStore.createDynamoDB<GroupChatEvent, GroupChat>({
    client: dynamodbClient,
    tables: {
      journal: journalTableName,
      snapshot: snapshotTableName,
      head: headTableName,
    },
    snapshotAidIndexName: snapshotHistoryIndexName,
    eventSerializer: groupChatEventSerializer,
    snapshotSerializer: groupChatSnapshotSerializer,
  });
  if (result.type === "err") {
    throw new Error(
      `Failed to create DynamoDB event store: ${result.error.message}`,
    );
  }
  return result.value;
}

async function createSpannerEventStore(): Promise<GroupChatEventStore> {
  const tablePrefix = env("PERSISTENCE_SPANNER_TABLE_PREFIX", "esa");
  const projectId = env("PERSISTENCE_SPANNER_PROJECT_ID", "local-project");
  const instanceId = env("PERSISTENCE_SPANNER_INSTANCE_ID", "local-instance");
  const databaseId = env("PERSISTENCE_SPANNER_DATABASE_ID", "local-database");

  logger.info(`PERSISTENCE_SPANNER_TABLE_PREFIX: ${tablePrefix}`);
  logger.info(`PERSISTENCE_SPANNER_PROJECT_ID: ${projectId}`);
  logger.info(`PERSISTENCE_SPANNER_INSTANCE_ID: ${instanceId}`);
  logger.info(`PERSISTENCE_SPANNER_DATABASE_ID: ${databaseId}`);
  logger.info(`SPANNER_EMULATOR_HOST: ${process.env.SPANNER_EMULATOR_HOST}`);

  // The Spanner SDK automatically targets the emulator when
  // SPANNER_EMULATOR_HOST is set in the environment.
  const spanner = new Spanner({ projectId });
  const database: Database = spanner.instance(instanceId).database(databaseId);

  const result = await SpannerEventStore.create<GroupChatEvent, GroupChat>({
    database,
    tablePrefix,
    eventSerializer: groupChatEventSerializer,
    snapshotSerializer: groupChatSnapshotSerializer,
  });
  if (result.type === "err") {
    throw new Error(
      `Failed to create Spanner event store: ${result.error.message}`,
    );
  }
  return result.value;
}

function createEventStore(
  backend: PersistenceBackend,
): Promise<GroupChatEventStore> {
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

  const eventStore = await createEventStore(backend);
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
