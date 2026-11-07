import type { PrismaClient } from "@prisma/client";
import {
  DeadLetterConsumer,
  DeadLetterRecovery,
  DeadLetterStore,
  GroupChatDao,
  type JournalReader,
  ReadModelUpdater,
} from "cqrs-es-example-js-rmu";
import type { RmuRuntimeConfig } from "./rmu-config";

export type DeadLetterRecoveryRuntime = {
  consumer: DeadLetterConsumer;
  recovery: DeadLetterRecovery;
};

/**
 * Builds the recovery projection shared by the one-shot task, the SQS Lambda
 * and the local worker. It reuses the same journal reader and position guard as
 * normal delivery; recovery only calls `applyStrict`, so it needs no dead-letter
 * store or notifier of its own.
 */
export function createDeadLetterRecoveryRuntime(
  prisma: PrismaClient,
  config: RmuRuntimeConfig,
  journalReader: JournalReader,
): DeadLetterRecoveryRuntime {
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
  return {
    consumer: DeadLetterConsumer.create(recovery, deadLetters),
    recovery,
  };
}
