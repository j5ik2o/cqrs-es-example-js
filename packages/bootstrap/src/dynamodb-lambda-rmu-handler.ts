import { PrismaClient } from "@prisma/client";
import type {
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
  Handler,
} from "aws-lambda";
import {
  DeadLetterStore,
  GroupChatDao,
  JournalReader,
  ReadModelUpdater,
} from "cqrs-es-example-js-rmu";
import { createDynamoDBClients } from "./dynamodb-clients";
import { loadRmuRuntimeConfig } from "./rmu-config";

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
  const config = loadRmuRuntimeConfig();
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const { dynamodbClient } = createDynamoDBClients();
  readModelUpdater = ReadModelUpdater.create(
    GroupChatDao.create(prisma),
    JournalReader.createDynamoDB(dynamodbClient, config.journalTableName),
    {
      retry: config.retry,
      deadLetters: DeadLetterStore.createSql(prisma),
      storeId: config.storeId,
      projectionName: config.projectionName,
      projectionVersion: config.projectionVersion,
    },
  );
  return readModelUpdater;
}

/**
 * Event source mapping contract: `ReportBatchItemFailures` is enabled on the
 * mapping, so the handler reports the stream records it could not apply and
 * Lambda retries only those. Permanent failures are already persisted as
 * dead-letter rows; the Lambda retry and its OnFailure destination are the
 * safety net, not the primary recovery path.
 */
export const handler: Handler<
  DynamoDBStreamEvent,
  DynamoDBBatchResponse
> = async (dynamodbStreamEvent) => {
  const result = await getReadModelUpdater().updateFromHeadStream(
    dynamodbStreamEvent,
    { reportBatchItemFailures: true },
  );
  return result ?? { batchItemFailures: [] };
};
