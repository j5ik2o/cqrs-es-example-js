import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  configureGroupChatController,
  GroupChatRepository,
} from "cqrs-es-example-js-command-interface-adaptor-impl";
import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import { EventStoreFactory } from "event-store-adapter-js";
import {
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {logger} from "./index";

function writeApiMain() {
  const apiHost =
    process.env.API_HOST !== undefined ? process.env.API_HOST : "localhost";
  const apiPort =
    process.env.API_PORT !== undefined ? parseInt(process.env.API_PORT) : 3000;

  const journalTableName =
    process.env.PERSISTENCE_JOURNAL_TABLE_NAME !== undefined
      ? process.env.PERSISTENCE_JOURNAL_TABLE_NAME
      : "journal";
  const snapshotTableName =
    process.env.PERSISTENCE_SNAPSHOT_TABLE_NAME !== undefined
      ? process.env.PERSISTENCE_SNAPSHOT_TABLE_NAME
      : "snapshot";
  const journalAidIndexName =
    process.env.PERSISTENCE_JOURNAL_AID_INDEX_NAME !== undefined
      ? process.env.PERSISTENCE_JOURNAL_AID_INDEX_NAME
      : "journal-aid-index";
  const snapshotAidIndexName =
    process.env.PERSISTENCE_SNAPSHOT_AID_INDEX_NAME !== undefined
      ? process.env.PERSISTENCE_SNAPSHOT_AID_INDEX_NAME
      : "snapshots-aid-index";
  const shardCount =
    process.env.PERSISTENCE_SHARD_COUNT !== undefined
      ? parseInt(process.env.PERSISTENCE_SHARD_COUNT)
      : 32;

  const awsRegion = process.env.AWS_REGION;
  const awsDynamodbEndpointUrl = process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const awsDynamodbAccessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const awsDynamodbSecretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

  logger.info("Starting write API server");
  logger.info(`API_HOST: ${apiHost}`);
  logger.info(`API_PORT: ${apiPort}`);
  logger.info(`PERSISTENCE_JOURNAL_TABLE_NAME: ${journalTableName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_TABLE_NAME: ${snapshotTableName}`);
  logger.info(`PERSISTENCE_JOURNAL_AID_INDEX_NAME: ${journalAidIndexName}`);
  logger.info(`PERSISTENCE_SNAPSHOT_AID_INDEX_NAME: ${snapshotAidIndexName}`);
  logger.info(`PERSISTENCE_SHARD_COUNT: ${shardCount}`);
  logger.info(`AWS_REGION: ${awsRegion}`);
  logger.info(`AWS_DYNAMODB_ENDPOINT_URL: ${awsDynamodbEndpointUrl}`);
  logger.info(`AWS_DYNAMODB_ACCESS_KEY_ID: ${awsDynamodbAccessKeyId}`);
  logger.info(`AWS_DYNAMODB_SECRET_ACCESS_KEY: ${awsDynamodbSecretAccessKey}`);

  let dynamodbClient: DynamoDBClient;
  if (
    awsRegion &&
    awsDynamodbEndpointUrl &&
    awsDynamodbAccessKeyId &&
    awsDynamodbSecretAccessKey
  ) {
    dynamodbClient = new DynamoDBClient({
      region: awsRegion,
      endpoint: awsDynamodbEndpointUrl,
      credentials: {
        accessKeyId: awsDynamodbAccessKeyId,
        secretAccessKey: awsDynamodbSecretAccessKey,
      },
    });
  } else {
    dynamodbClient = new DynamoDBClient();
  }

  const eventStore = EventStoreFactory.ofDynamoDB<
    GroupChatId,
    GroupChat,
    GroupChatEvent
  >(
    dynamodbClient,
    journalTableName,
    snapshotTableName,
    journalAidIndexName,
    snapshotAidIndexName,
    shardCount,
    convertJSONToGroupChatEvent,
    convertJSONToGroupChat,
  );
  const groupChatRepository = GroupChatRepository.of(eventStore);
  const groupChatCommandProcessor =
    GroupChatCommandProcessor.of(groupChatRepository);

  const writeApiServer = new Hono();

  writeApiServer.get("/hello", async (c) => {
    return c.text("Hello, world!");
  });

  configureGroupChatController(writeApiServer, "v1", groupChatCommandProcessor);

  serve(
    { fetch: writeApiServer.fetch, hostname: apiHost, port: apiPort },
    (addressInfo) => {
      logger.info(
        `Server started on ${addressInfo.address}:${addressInfo.port}`,
      );
    },
  );
}

export { writeApiMain };
