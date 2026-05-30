import { PubSub } from "@google-cloud/pubsub";
import { Spanner } from "@google-cloud/spanner";
import { logger } from "./index";
import {
  type ChangeStreamReader,
  createChangeStreamReader,
} from "./spanner-change-stream-reader";

/**
 * Local Spanner Change Stream bridge.
 *
 * Production topology (documented):
 *   Spanner journal -> Change Streams -> Dataflow -> Pub/Sub -> Cloud Run /
 *   Cloud Functions (RMU) -> MySQL.
 *
 * This process is the local development stand-in for the managed Dataflow stage:
 * it reads the `journal` change stream and republishes each domain-event payload
 * to a Pub/Sub topic, preserving the Pub/Sub message contract the Functions
 * Framework RMU consumes. It watches `journal` only, so snapshot writes never
 * drive read-model updates.
 *
 * Change-stream reads use low-level single-use ExecuteStreamingSql
 * (`spanner-change-stream-reader.ts`), which works on both the Spanner emulator
 * and real Spanner — the high-level run/runStream cannot read change streams on
 * the emulator. At-least-once publishing is fine: the read-model DAO is
 * idempotent.
 */

const POLL_WINDOW_MILLIS = 2_000;
const POLL_INTERVAL_MILLIS = 1_000;

async function spannerChangeStreamBridgeMain(): Promise<void> {
  const projectId = env("PERSISTENCE_SPANNER_PROJECT_ID", "local-project");
  const instanceId = env("PERSISTENCE_SPANNER_INSTANCE_ID", "local-instance");
  const databaseId = env("PERSISTENCE_SPANNER_DATABASE_ID", "local-database");
  const changeStreamName = env("SPANNER_CHANGE_STREAM_NAME", "journal_stream");
  const journalTableName = env("PERSISTENCE_JOURNAL_TABLE_NAME", "journal");
  const topicName = env("PUBSUB_TOPIC", "group-chat-journal");

  logger.info("Starting Spanner change stream bridge");
  logger.info(`PERSISTENCE_SPANNER_PROJECT_ID: ${projectId}`);
  logger.info(`PERSISTENCE_SPANNER_INSTANCE_ID: ${instanceId}`);
  logger.info(`PERSISTENCE_SPANNER_DATABASE_ID: ${databaseId}`);
  logger.info(`SPANNER_CHANGE_STREAM_NAME: ${changeStreamName}`);
  logger.info(`PERSISTENCE_JOURNAL_TABLE_NAME: ${journalTableName}`);
  logger.info(`PUBSUB_TOPIC: ${topicName}`);
  logger.info(`SPANNER_EMULATOR_HOST: ${process.env.SPANNER_EMULATOR_HOST}`);
  logger.info(`PUBSUB_EMULATOR_HOST: ${process.env.PUBSUB_EMULATOR_HOST}`);

  const spanner = new Spanner({ projectId });
  const pubsub = new PubSub({ projectId });
  const topic = pubsub.topic(topicName);
  const reader = createChangeStreamReader(spanner, {
    projectId,
    instanceId,
    databaseId,
    streamName: changeStreamName,
  });

  let watermark = new Date();
  try {
    for (;;) {
      const end = new Date(
        Math.min(Date.now(), watermark.getTime() + POLL_WINDOW_MILLIS),
      );
      if (end.getTime() <= watermark.getTime()) {
        await sleep(POLL_INTERVAL_MILLIS);
        continue;
      }
      await pollOnce(
        reader,
        topic,
        journalTableName,
        watermark.toISOString(),
        end.toISOString(),
      );
      watermark = end;
      await sleep(POLL_INTERVAL_MILLIS);
    }
  } finally {
    await reader.close();
    await topic.flush().catch(() => undefined);
    await pubsub.close().catch(() => undefined);
    spanner.close();
  }
}

async function pollOnce(
  reader: ChangeStreamReader,
  // biome-ignore lint/suspicious/noExplicitAny: PubSub Topic type
  topic: any,
  journalTableName: string,
  start: string,
  end: string,
): Promise<void> {
  let records: Awaited<ReturnType<ChangeStreamReader["readWindow"]>>;
  try {
    records = await reader.readWindow(start, end);
  } catch (error) {
    logger.warn(`change-stream read failed for [${start}, ${end}]`, error);
    return;
  }
  for (const record of records) {
    if (record.tableName !== journalTableName || record.modType !== "INSERT") {
      continue;
    }
    const payload = record.newValues.payload;
    if (typeof payload !== "string") {
      continue;
    }
    // `payload` is the BYTES journal payload, base64-encoded in the change
    // record — exactly the wire format the Pub/Sub RMU adapter expects.
    await topic.publishMessage({
      data: Buffer.from(payload, "base64"),
      attributes: {
        aggregateId: String(record.keys.aggregate_id ?? ""),
        sequenceNumber: String(record.keys.sequence_number ?? ""),
        commitTimestamp: record.commitTimestamp,
        sourceProvider: "spanner",
      },
    });
  }
}

function env(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : defaultValue;
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export { spannerChangeStreamBridgeMain };
