import { PrismaClient } from "@prisma/client";
import type { Handler, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { type DeadLetterConsumer, JournalReader } from "cqrs-es-example-js-rmu";
import { createDeadLetterRecoveryRuntime } from "./dead-letter-recovery-runtime";
import { createDynamoDBClients } from "./dynamodb-clients";
import { loadRmuRuntimeConfig } from "./rmu-config";

type Runtime = {
  consumer: DeadLetterConsumer;
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
    datasources: { db: { url: databaseUrl } },
  });
  const { dynamodbClient } = createDynamoDBClients();
  const journalReader = JournalReader.createDynamoDB(
    dynamodbClient,
    config.journalTableName,
  );
  const { consumer } = createDeadLetterRecoveryRuntime(
    prisma,
    config,
    journalReader,
  );
  runtime = { consumer };
  return runtime;
}

/**
 * SQS contract: the message is a trigger only. The consumer re-reads the
 * durable row and recovery re-reads the journal, so redelivery is safe.
 * Invalid and already-resolved messages are acknowledged; only a failed
 * recovery is reported so the queue retries it.
 */
export const handler: Handler<SQSEvent, SQSBatchResponse> = async (event) => {
  const { consumer } = getRuntime();
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    const outcome = await consumer.consume(record.body);
    if (outcome.status === "invalid") {
      console.warn(
        `Ignoring invalid dead-letter message ${record.messageId}: ${outcome.reason}`,
      );
      continue;
    }
    if (outcome.status === "failed") {
      console.error(
        `Recovery failed for dead-letter message ${record.messageId}`,
        outcome.error,
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
