import {
  DescribeTableCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { PrismaClient } from "@prisma/client";
import type {
  DynamoDBStreamEvent,
  AttributeValue as LambdaAttributeValue,
} from "aws-lambda";
import {
  DeadLetterStore,
  GroupChatDao,
  JournalReader,
  ReadModelUpdater,
  type StreamProcessingResult,
  type StreamRecordDescriptor,
  backoffDelay,
  decodeHeadScanItems,
  processStream,
  scanHeadTable,
} from "cqrs-es-example-js-rmu";
import { createDeadLetterNotifier } from "./dead-letter-notifier-factory";
import { createDynamoDBClients } from "./dynamodb-clients";
import { createDynamoDBStreamClient } from "./dynamodb-stream-client";
import { logger } from "./index";
import { type RmuRuntimeConfig, loadRmuRuntimeConfig } from "./rmu-config";
import type { PrismaQueryEvent } from "./types";

async function dynamodbLocalRmuMain() {
  logger.info("Starting local read model updater");

  const config = loadRmuRuntimeConfig();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  logger.info(`STREAM_HEAD_TABLE_NAME: ${config.headTableName}`);
  logger.info(`STREAM_JOURNAL_TABLE_NAME: ${config.journalTableName}`);
  logger.info(`STREAM_MAX_ITEM_COUNT: ${config.maxItemCount}`);
  logger.info(`STREAM_POLL_INTERVAL_MS: ${config.pollIntervalMs}`);
  logger.info(`DATABASE_URL: ${databaseUrl}`);

  const { dynamodbClient, dynamodbStreamsClient } = createDynamoDBClients();

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: [{ level: "query", emit: "event" }],
  });
  prisma.$on("query", async (e: PrismaQueryEvent) => {
    logger.info(`Query: ${e.query}`);
    logger.info(`Params: ${e.params}`);
    logger.info(`Duration: ${e.duration}ms`);
  });

  const journalReader = JournalReader.createDynamoDB(
    dynamodbClient,
    config.journalTableName,
  );
  const readModelUpdater = ReadModelUpdater.create(
    GroupChatDao.create(prisma),
    journalReader,
    {
      retry: config.retry,
      deadLetters: DeadLetterStore.createSql(prisma),
      notifier: createDeadLetterNotifier(config),
      onNotificationError: (error, record) => {
        logger.warn(
          `Dead-letter notification failed for ${record.aggregateId} seq_nr ${record.seqNr}: ${String(error)}`,
        );
      },
      storeId: config.storeId,
      projectionName: config.projectionName,
      projectionVersion: config.projectionVersion,
    },
  );

  const state: {
    lastProcessedAt: Date | undefined;
    startAfter: Record<string, string>;
  } = {
    lastProcessedAt: undefined,
    startAfter: {},
  };
  let failureAttempt = 0;

  for (;;) {
    try {
      const streamArn = await describeHeadStreamArn(
        dynamodbClient,
        config.headTableName,
      );
      const streamClient = createDynamoDBStreamClient(
        dynamodbStreamsClient,
        streamArn,
      );
      const result = await processStream({
        client: streamClient,
        resynchronize: () =>
          resynchronizeHead(dynamodbClient, config, readModelUpdater),
        persist: (records) =>
          persistRecords(readModelUpdater, streamArn, records),
        lastProcessedAt: state.lastProcessedAt,
        startAfter: state.startAfter,
        retentionMs: config.streamRetentionMs,
        maxRecordsPerPage: config.maxItemCount,
        onResynchronize: (reason) => {
          logger.info(`Resynchronized the read model (${reason})`);
        },
      });
      state.lastProcessedAt = result.lastProcessedAt;
      state.startAfter = result.lastSequenceNumbers;
      failureAttempt = 0;
      await afterPass(result, config);
    } catch (error) {
      failureAttempt += 1;
      const delayMs = backoffDelay(
        failureAttempt,
        config.streamRetry,
        Math.random,
      );
      logger.error(
        `Stream processing failed; backing off ${delayMs}ms before restarting`,
        error,
      );
      await sleep(delayMs);
    }
  }
}

async function describeHeadStreamArn(
  client: DynamoDBClient,
  headTableName: string,
): Promise<string> {
  const result = await client.send(
    new DescribeTableCommand({ TableName: headTableName }),
  );
  const streamArn = result.Table?.LatestStreamArn;
  if (streamArn === undefined) {
    throw new Error(`StreamArn is not set for table ${headTableName}`);
  }
  return streamArn;
}

/**
 * DY-15 reconciliation: a strongly consistent Scan of every head item, then the
 * journal catch-up through the normal position guard. Duplicate delivery from
 * the resumed stream is dropped by `read_model_positions`.
 */
async function resynchronizeHead(
  dynamodbClient: DynamoDBClient,
  config: RmuRuntimeConfig,
  readModelUpdater: ReadModelUpdater,
): Promise<void> {
  const items = await scanHeadTable(dynamodbClient, config.headTableName);
  const inputs = decodeHeadScanItems(items);
  if (inputs.length === 0) {
    logger.info("Head resynchronization found no head events");
    return;
  }
  const result = await readModelUpdater.apply(inputs, {
    reportBatchItemFailures: true,
  });
  const failures = result?.batchItemFailures.length ?? 0;
  logger.info(
    `Head resynchronization applied ${inputs.length} head event(s), ${failures} failed`,
  );
}

async function persistRecords(
  readModelUpdater: ReadModelUpdater,
  streamArn: string,
  records: readonly StreamRecordDescriptor[],
): Promise<{ failed: boolean }> {
  for (const record of records) {
    logger.info(
      `keys = ${JSON.stringify({
        aid: record.newImage?.aid,
        seq_nr: record.newImage?.seq_nr,
      })}`,
    );
  }
  const event = toStreamEvent(records, streamArn);
  if (event.Records.length === 0) {
    return { failed: false };
  }
  const result = await readModelUpdater.updateFromHeadStream(event, {
    reportBatchItemFailures: true,
  });
  const failed = (result?.batchItemFailures.length ?? 0) > 0;
  if (failed) {
    logger.warn(
      `Could not project ${result?.batchItemFailures.length ?? 0} head record(s); they are recorded in the dead-letter table`,
    );
  }
  return { failed };
}

function toStreamEvent(
  records: readonly StreamRecordDescriptor[],
  streamArn: string,
): DynamoDBStreamEvent {
  const items = records
    .filter(
      (record) =>
        record.eventName !== "REMOVE" && record.newImage !== undefined,
    )
    .map((record) => ({
      awsRegion: process.env.AWS_REGION,
      dynamodb: {
        ApproximateCreationDateTime: record.approximateCreationDateTime,
        NewImage: record.newImage as Record<string, LambdaAttributeValue>,
        SequenceNumber: record.sequenceNumber,
        StreamViewType: "NEW_IMAGE" as const,
      },
      eventID: record.sequenceNumber,
      eventName: record.eventName,
      eventSource: "aws:dynamodb",
      eventSourceARN: streamArn,
      eventVersion: "1.1",
    }));
  return { Records: items } as unknown as DynamoDBStreamEvent;
}

async function afterPass(
  result: StreamProcessingResult,
  config: RmuRuntimeConfig,
): Promise<void> {
  if (result.stoppedOnFailure) {
    // The failed event is already dead-lettered; replay the retained stream
    // after a bounded delay so another aggregate is not starved by a tight loop.
    await sleep(config.pollIntervalMs);
    return;
  }
  if (result.reachedEnd) {
    // Caught up with the shard tail: poll instead of spinning on the stream.
    await sleep(config.pollIntervalMs);
  }
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export { dynamodbLocalRmuMain };
