import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PrismaClient } from "@prisma/client";
import type { DynamoDBStreamEvent, Handler } from "aws-lambda";
import {
  GroupChatDao,
  JournalReader,
  ReadModelUpdater,
} from "cqrs-es-example-js-rmu";

let prisma: PrismaClient | undefined;
let readModelUpdater: ReadModelUpdater | undefined;

function getReadModelUpdater(): ReadModelUpdater {
  if (readModelUpdater) {
    return readModelUpdater;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const journalTableName =
    process.env.STREAM_JOURNAL_TABLE_NAME !== undefined
      ? process.env.STREAM_JOURNAL_TABLE_NAME
      : "journal";
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  readModelUpdater = ReadModelUpdater.create(
    GroupChatDao.create(prisma),
    JournalReader.createDynamoDB(new DynamoDBClient(), journalTableName),
  );
  return readModelUpdater;
}

export const handler: Handler<DynamoDBStreamEvent, void> = async (
  dynamodbStreamEvent,
) => {
  await getReadModelUpdater().updateFromHeadStream(dynamodbStreamEvent);
};
