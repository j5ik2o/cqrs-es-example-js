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
  resynchronizeFromHead,
  scanHeadTable,
} from "cqrs-es-example-js-rmu";
import { createDeadLetterNotifier } from "./dead-letter-notifier-factory";
import { createDynamoDBClients } from "./dynamodb-clients";
import { loadRmuRuntimeConfig } from "./rmu-config";
import {
  type StartupResynchronizer,
  createStartupResynchronizer,
} from "./startup-resynchronizer";

type Runtime = {
  updater: ReadModelUpdater;
  /** DY-15 cold-start reconciliation, kept once per container. */
  startupResynchronizer: StartupResynchronizer;
};

let runtime: Runtime | undefined;

function getRuntime(): Runtime {
  if (runtime) {
    return runtime;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const config = loadRmuRuntimeConfig();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  const { dynamodbClient } = createDynamoDBClients();
  const updater = ReadModelUpdater.create(
    GroupChatDao.create(prisma),
    JournalReader.createDynamoDB(dynamodbClient, config.journalTableName),
    {
      retry: config.retry,
      deadLetters: DeadLetterStore.createSql(prisma),
      deadLetterBatchLimit: config.deadLetterBatchLimit,
      notifier: createDeadLetterNotifier(config),
      onNotificationError: (error, record) => {
        // The recovery task is already durable; a notify failure is logged and
        // left to the scheduled recovery run rather than retried forever.
        console.error(
          `Dead-letter notification failed for ${record.aggregateId} seq_nr ${record.seqNr}`,
          error,
        );
      },
      storeId: config.storeId,
      projectionName: config.projectionName,
      projectionVersion: config.projectionVersion,
    },
  );
  const startupResynchronizer = createStartupResynchronizer(async () => {
    const count = await resynchronizeFromHead({
      scan: () => scanHeadTable(dynamodbClient, config.headTableName),
      apply: async (inputs) => {
        const result = await updater.apply(inputs, {
          reportBatchItemFailures: true,
        });
        const failed = result?.batchItemFailures.length ?? 0;
        if (failed > 0) {
          console.warn(
            `Startup head scan left ${failed} record(s) for redelivery`,
          );
        }
        return result;
      },
    });
    console.info(`Startup head scan applied ${count} head event(s)`);
  });
  runtime = { updater, startupResynchronizer };
  return runtime;
}

/**
 * Event source mapping contract: `ReportBatchItemFailures` is enabled on the
 * mapping, so the handler reports the stream records it could not apply and
 * Lambda retries only those. Permanent failures are already persisted as
 * dead-letter rows; the Lambda retry and its OnFailure destination are the
 * safety net, not the primary recovery path.
 *
 * The first invocation in a container also reconciles the whole head table
 * (DY-15): a cold start may have missed more than the stream retains, and a new
 * aggregate must not be skipped just because its events predate the consumer.
 */
export const handler: Handler<
  DynamoDBStreamEvent,
  DynamoDBBatchResponse
> = async (dynamodbStreamEvent) => {
  const { updater, startupResynchronizer } = getRuntime();
  await startupResynchronizer.run();
  const result = await updater.updateFromHeadStream(dynamodbStreamEvent, {
    reportBatchItemFailures: true,
  });
  return result ?? { batchItemFailures: [] };
};
