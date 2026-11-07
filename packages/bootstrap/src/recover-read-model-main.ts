import { PrismaClient } from "@prisma/client";
import {
  DeadLetterRecovery,
  DeadLetterStore,
  GroupChatDao,
  JournalReader,
  ReadModelUpdater,
} from "cqrs-es-example-js-rmu";
import { createDynamoDBClients } from "./dynamodb-clients";
import { logger } from "./index";
import { loadRmuRuntimeConfig } from "./rmu-config";

/**
 * One-shot recovery task. It reads the durable dead-letter table, re-reads the
 * authoritative journal for each failed event, replays the range idempotently,
 * verifies the read-model position reached the target, and deletes the task.
 * Run it on a schedule or after an operator fixes the underlying cause.
 */
async function recoverReadModelMain(): Promise<void> {
  const config = loadRmuRuntimeConfig();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const { dynamodbClient } = createDynamoDBClients();
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    const journalReader = JournalReader.createDynamoDB(
      dynamodbClient,
      config.journalTableName,
    );
    const updater = ReadModelUpdater.create(
      GroupChatDao.create(prisma),
      journalReader,
      {
        retry: config.retry,
        storeId: config.storeId,
        projectionName: config.projectionName,
        projectionVersion: config.projectionVersion,
      },
    );
    const deadLetters = DeadLetterStore.createSql(prisma);
    const recovery = DeadLetterRecovery.create(
      updater,
      journalReader,
      deadLetters,
      {
        batchSize: config.recoveryBatchSize,
        projectionName: config.projectionName,
      },
    );

    const outcome = await recovery.recoverAll();
    logger.info(
      `Recovered ${outcome.recovered} dead letter(s); ${outcome.failed} failed, ${outcome.remaining} remaining`,
    );
    for (const failure of outcome.failures) {
      logger.error(
        `Recovery failed for ${failure.record.aggregateId} seq_nr ${failure.record.seqNr}: ${String(failure.error)}`,
      );
    }
    if (outcome.failed > 0) {
      throw new Error(
        `${outcome.failed} dead letter(s) could not be recovered`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

export { recoverReadModelMain };
