import { PubSub } from "@google-cloud/pubsub";
import { Spanner } from "@google-cloud/spanner";
import { logger } from "./index";

/**
 * Idempotent bootstrap of the local Spanner + Pub/Sub topology used by the
 * Spanner read-model pipeline:
 *  - Spanner instance + database with the event-store journal/snapshot tables
 *    and a change stream watching `journal`.
 *  - Pub/Sub topic + push subscription delivering to the Functions Framework
 *    RMU endpoint.
 *
 * Targets the emulators via SPANNER_EMULATOR_HOST / PUBSUB_EMULATOR_HOST.
 */
async function spannerSetupMain(): Promise<void> {
  const projectId = env("PERSISTENCE_SPANNER_PROJECT_ID", "local-project");
  const instanceId = env("PERSISTENCE_SPANNER_INSTANCE_ID", "local-instance");
  const databaseId = env("PERSISTENCE_SPANNER_DATABASE_ID", "local-database");
  const journalTableName = env("PERSISTENCE_JOURNAL_TABLE_NAME", "journal");
  const snapshotTableName = env("PERSISTENCE_SNAPSHOT_TABLE_NAME", "snapshot");
  const changeStreamName = env("SPANNER_CHANGE_STREAM_NAME", "journal_stream");
  const topicName = env("PUBSUB_TOPIC", "group-chat-journal");
  const subscriptionName = env("PUBSUB_SUBSCRIPTION", "group-chat-journal-sub");
  const pushEndpoint = env("PUBSUB_PUSH_ENDPOINT", "http://rmu-function:8080/");

  logger.info("Running Spanner + Pub/Sub setup");
  await setupSpanner({
    projectId,
    instanceId,
    databaseId,
    journalTableName,
    snapshotTableName,
    changeStreamName,
  });
  await setupPubSub({ projectId, topicName, subscriptionName, pushEndpoint });
  logger.info("Spanner + Pub/Sub setup complete");
}

async function setupSpanner(input: {
  projectId: string;
  instanceId: string;
  databaseId: string;
  journalTableName: string;
  snapshotTableName: string;
  changeStreamName: string;
}): Promise<void> {
  const spanner = new Spanner({ projectId: input.projectId });
  try {
    const instance = spanner.instance(input.instanceId);
    if (!(await instance.exists())[0]) {
      const [, op] = await spanner.createInstance(input.instanceId, {
        config: "emulator-config",
        nodes: 1,
        displayName: "Local Instance",
      });
      await op.promise();
      logger.info(`Created Spanner instance: ${input.instanceId}`);
    }
    const database = instance.database(input.databaseId);
    if (!(await database.exists())[0]) {
      const [, op] = await instance.createDatabase(input.databaseId, {
        schema: eventStoreSchema(
          input.journalTableName,
          input.snapshotTableName,
        ),
      });
      await op.promise();
      logger.info(`Created Spanner database: ${input.databaseId}`);
    }
    try {
      const [op] = await database.updateSchema([
        `CREATE CHANGE STREAM ${input.changeStreamName} FOR ${input.journalTableName}`,
      ]);
      await op.promise();
      logger.info(`Created change stream: ${input.changeStreamName}`);
    } catch (error) {
      // Tolerate only "already exists" on re-run; surface everything else
      // (permissions, connectivity, invalid DDL) instead of reporting success.
      if (isAlreadyExists(error)) {
        logger.info(`Change stream already exists: ${input.changeStreamName}`);
      } else {
        throw error;
      }
    }
    await database.close();
  } finally {
    spanner.close();
  }
}

async function setupPubSub(input: {
  projectId: string;
  topicName: string;
  subscriptionName: string;
  pushEndpoint: string;
}): Promise<void> {
  const pubsub = new PubSub({ projectId: input.projectId });
  const topic = pubsub.topic(input.topicName);
  if (!(await topic.exists())[0]) {
    await topic.create();
    logger.info(`Created Pub/Sub topic: ${input.topicName}`);
  }
  const subscription = topic.subscription(input.subscriptionName);
  if (!(await subscription.exists())[0]) {
    await subscription.create({
      pushConfig: { pushEndpoint: input.pushEndpoint },
    });
    logger.info(
      `Created Pub/Sub push subscription: ${input.subscriptionName} -> ${input.pushEndpoint}`,
    );
  }
  await pubsub.close();
}

function eventStoreSchema(
  journalTableName: string,
  snapshotTableName: string,
): string[] {
  return [
    `CREATE TABLE ${journalTableName} (
      shard_id INT64 NOT NULL,
      aggregate_id STRING(MAX) NOT NULL,
      sequence_number INT64 NOT NULL,
      payload BYTES(MAX) NOT NULL,
      occurred_at TIMESTAMP NOT NULL
    ) PRIMARY KEY (shard_id, aggregate_id, sequence_number)`,
    `CREATE TABLE ${snapshotTableName} (
      shard_id INT64 NOT NULL,
      aggregate_id STRING(MAX) NOT NULL,
      sequence_number INT64 NOT NULL,
      version INT64 NOT NULL,
      payload BYTES(MAX) NOT NULL,
      updated_at TIMESTAMP NOT NULL
    ) PRIMARY KEY (shard_id, aggregate_id, sequence_number)`,
  ];
}

function env(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : defaultValue;
}

// gRPC ALREADY_EXISTS = 6.
function isAlreadyExists(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: number }).code;
    if (code === 6) {
      return true;
    }
    const message = (error as { message?: string }).message ?? "";
    return /already exists|duplicate name/i.test(message);
  }
  return false;
}

export { spannerSetupMain };
