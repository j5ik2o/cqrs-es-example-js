import {
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import { PrismaClient } from "@prisma/client";
import { type DeadLetterConsumer, JournalReader } from "cqrs-es-example-js-rmu";
import { createSqsClient } from "./dead-letter-notifier-factory";
import { createDeadLetterRecoveryRuntime } from "./dead-letter-recovery-runtime";
import { createDynamoDBClients } from "./dynamodb-clients";
import { logger } from "./index";
import { type RmuRuntimeConfig, loadRmuRuntimeConfig } from "./rmu-config";

/**
 * Long-polling SQS worker for deployments that do not run the Lambda consumer.
 * It acknowledges invalid messages, leaves a failed recovery for redelivery,
 * and relies on the same idempotent recovery task as every other path.
 */
async function sqsDeadLetterMain(): Promise<void> {
  const config = loadRmuRuntimeConfig();
  const queueUrl = config.deadLetterQueueUrl;
  if (queueUrl === undefined) {
    throw new Error("RMU_DEAD_LETTER_QUEUE_URL is not set");
  }
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
    const { consumer } = createDeadLetterRecoveryRuntime(
      prisma,
      config,
      journalReader,
    );
    logger.info(`Consuming dead-letter notifications from ${queueUrl}`);
    await consumeQueue(createSqsClient(config), queueUrl, config, consumer);
  } finally {
    await prisma.$disconnect();
  }
}

async function consumeQueue(
  sqs: SQSClient,
  queueUrl: string,
  config: RmuRuntimeConfig,
  consumer: DeadLetterConsumer,
): Promise<void> {
  let failureAttempt = 0;
  for (;;) {
    try {
      const output = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: config.deadLetterConsume.maxMessages,
          WaitTimeSeconds: config.deadLetterConsume.waitTimeSeconds,
          VisibilityTimeout: config.deadLetterConsume.visibilityTimeoutSeconds,
        }),
      );
      failureAttempt = 0;
      await consumeMessages(sqs, queueUrl, output.Messages ?? [], consumer);
    } catch (error) {
      failureAttempt += 1;
      const delayMs = Math.min(60_000, 1000 * 2 ** (failureAttempt - 1));
      logger.error(
        `SQS receive failed; retrying in ${delayMs}ms: ${String(error)}`,
      );
      await sleep(delayMs);
    }
  }
}

async function consumeMessages(
  sqs: SQSClient,
  queueUrl: string,
  messages: readonly Message[],
  consumer: DeadLetterConsumer,
): Promise<void> {
  for (const message of messages) {
    const messageId = message.MessageId ?? "unknown";
    const outcome = await consumer.consume(message.Body ?? "");
    if (outcome.status === "failed") {
      logger.error(
        `Recovery failed for ${messageId}: ${String(outcome.error)}`,
      );
      // Leave the message unacknowledged so SQS redelivers it.
      continue;
    }
    if (outcome.status === "invalid") {
      logger.warn(
        `Dropping invalid dead-letter message ${messageId}: ${outcome.reason}`,
      );
    }
    if (message.ReceiptHandle !== undefined) {
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    }
  }
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export { sqsDeadLetterMain };
