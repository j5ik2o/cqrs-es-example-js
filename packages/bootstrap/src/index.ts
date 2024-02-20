import { Hono } from "hono";
import {
  groupChatController,
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

const journalTableName =
  process.env.JOURNAL_TABLE_NAME !== undefined
    ? process.env.JOURNAL_TABLE_NAME
    : "journal";
const snapshotTableName =
  process.env.SNAPSHOT_TABLE_NAME !== undefined
    ? process.env.SNAPSHOT_TABLE_NAME
    : "snapshot";
const journalAidIndexName =
  process.env.JOURNAL_AID_INDEX_NAME !== undefined
    ? process.env.JOURNAL_AID_INDEX_NAME
    : "journal-aid-index";
const snapshotAidIndexName =
  process.env.SNAPSHOT_AID_INDEX_NAME !== undefined
    ? process.env.SNAPSHOT_AID_INDEX_NAME
    : "snapshots-aid-index";

const awsRegion = process.env.AWS_REGION;
const awsDynamodbEndpoint = process.env.AWS_DYNAMODB_ENDPOINT;
const awsDynamodbAccessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
const awsDynamodbSecretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

let dynamodbClient: DynamoDBClient;
if (
  awsRegion &&
  awsDynamodbEndpoint &&
  awsDynamodbAccessKeyId &&
  awsDynamodbSecretAccessKey
) {
  dynamodbClient = new DynamoDBClient({
    region: awsRegion,
    endpoint: awsDynamodbEndpoint,
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
  32,
  convertJSONToGroupChatEvent,
  convertJSONToGroupChat,
);
const groupChatRepository = GroupChatRepository.of(eventStore);
const groupChatCommandProcessor =
  GroupChatCommandProcessor.of(groupChatRepository);

const app = new Hono();
groupChatController(app, groupChatCommandProcessor);
