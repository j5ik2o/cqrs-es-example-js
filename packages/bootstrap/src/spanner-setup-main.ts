import { PubSub } from "@google-cloud/pubsub";
import { type Database, Spanner } from "@google-cloud/spanner";
import { logger } from "./index";

/**
 * Idempotent bootstrap of the local Spanner + Pub/Sub topology used by the
 * Spanner read-model pipeline:
 *  - Spanner instance + database with the ESA v5 five-table layout and a
 *    change stream watching `<prefix>_journal`.
 *  - Pub/Sub topic + push subscription delivering to the Functions Framework
 *    RMU endpoint.
 *
 * Targets the emulators via SPANNER_EMULATOR_HOST / PUBSUB_EMULATOR_HOST.
 */
async function spannerSetupMain(): Promise<void> {
  const projectId = env("PERSISTENCE_SPANNER_PROJECT_ID", "local-project");
  const instanceId = env("PERSISTENCE_SPANNER_INSTANCE_ID", "local-instance");
  const databaseId = env("PERSISTENCE_SPANNER_DATABASE_ID", "local-database");
  const tablePrefix = env("PERSISTENCE_SPANNER_TABLE_PREFIX", "esa");
  const changeStreamName = env("SPANNER_CHANGE_STREAM_NAME", "journal_stream");
  const topicName = env("PUBSUB_TOPIC", "group-chat-journal");
  const subscriptionName = env("PUBSUB_SUBSCRIPTION", "group-chat-journal-sub");
  const pushEndpoint = env("PUBSUB_PUSH_ENDPOINT", "http://rmu-function:8080/");

  logger.info("Running Spanner + Pub/Sub setup");
  await setupSpanner({
    projectId,
    instanceId,
    databaseId,
    tablePrefix,
    changeStreamName,
  });
  await setupPubSub({ projectId, topicName, subscriptionName, pushEndpoint });
  logger.info("Spanner + Pub/Sub setup complete");
}

async function setupSpanner(input: {
  projectId: string;
  instanceId: string;
  databaseId: string;
  tablePrefix: string;
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
        schema: eventStoreSchema(input.tablePrefix),
      });
      await op.promise();
      logger.info(`Created Spanner database: ${input.databaseId}`);
    }
    // A previous run may have created the database and then failed before
    // writing the config row, so always ensure it exists rather than tying the
    // insert to the create-database branch.
    await ensureSpannerConfig(database, input.tablePrefix);
    try {
      const [op] = await database.updateSchema([
        `CREATE CHANGE STREAM ${input.changeStreamName} FOR ${input.tablePrefix}_journal`,
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

async function ensureSpannerConfig(
  database: Database,
  tablePrefix: string,
): Promise<void> {
  await database.runTransactionAsync(async (transaction) => {
    const [rows] = await transaction.run({
      sql: `SELECT singleton FROM ${tablePrefix}_config WHERE singleton = 1`,
    });
    if (rows.length === 0) {
      await transaction.run({
        sql: `INSERT INTO ${tablePrefix}_config (
          singleton, store_id, layout_version, keep_snapshot_count,
          retention_mode, ttl_grace_days, change_feed_enabled
        ) VALUES (1, GENERATE_UUID(), 1, NULL, 'delete', NULL, FALSE)`,
      });
    }
    await transaction.commit();
  });
}

function eventStoreSchema(tablePrefix: string): string[] {
  return [
    `CREATE TABLE ${tablePrefix}_journal (
      hash_prefix BYTES(8) NOT NULL,
      aid STRING(1024) NOT NULL,
      seq_nr INT64 NOT NULL,
      occurred_at_ns INT64 NOT NULL,
      manifest STRING(MAX) NOT NULL,
      payload BYTES(MAX) NOT NULL
    ) PRIMARY KEY (hash_prefix, aid, seq_nr)`,
    `CREATE TABLE ${tablePrefix}_head (
      hash_prefix BYTES(8) NOT NULL,
      aid STRING(1024) NOT NULL,
      type_name STRING(1024) NOT NULL,
      seq_nr INT64 NOT NULL,
      event_occurred_at_ns INT64 NOT NULL,
      event_manifest STRING(MAX) NOT NULL,
      event_payload BYTES(MAX) NOT NULL
    ) PRIMARY KEY (hash_prefix, aid)`,
    `CREATE TABLE ${tablePrefix}_snapshot_current (
      hash_prefix BYTES(8) NOT NULL,
      aid STRING(1024) NOT NULL,
      seq_nr INT64 NOT NULL,
      manifest STRING(MAX) NOT NULL,
      payload BYTES(MAX) NOT NULL
    ) PRIMARY KEY (hash_prefix, aid)`,
    `CREATE TABLE ${tablePrefix}_snapshot_history (
      hash_prefix BYTES(8) NOT NULL,
      aid STRING(1024) NOT NULL,
      seq_nr INT64 NOT NULL,
      manifest STRING(MAX) NOT NULL,
      payload BYTES(MAX) NOT NULL,
      expired_at TIMESTAMP
    ) PRIMARY KEY (hash_prefix, aid, seq_nr)`,
    `CREATE TABLE ${tablePrefix}_config (
      singleton INT64 NOT NULL,
      store_id STRING(36) NOT NULL,
      layout_version INT64 NOT NULL,
      keep_snapshot_count INT64,
      retention_mode STRING(8) NOT NULL,
      ttl_grace_days INT64,
      change_feed_enabled BOOL NOT NULL
    ) PRIMARY KEY (singleton)`,
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
