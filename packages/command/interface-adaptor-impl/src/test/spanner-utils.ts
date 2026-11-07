import { type Database, type Instance, Spanner } from "@google-cloud/spanner";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

const DEFAULT_PROJECT_ID = "test-project";
const SPANNER_EMULATOR_GRPC_PORT = 9010;
const SPANNER_EMULATOR_REST_PORT = 9020;

let spannerEnvLock: Promise<void> = Promise.resolve();

/**
 * Boots the Cloud Spanner emulator and creates an instance + database with the
 * ESA v5 five-table layout for `tablePrefix`. When `changeStreamName` is given,
 * creates a change stream on `<prefix>_journal` for the CDC bridge tests.
 * Mirrors the upstream event-store-adapter-js example harness.
 */
async function startSpannerContainer(input: {
  instanceId: string;
  databaseId: string;
  tablePrefix: string;
  changeStreamName?: string;
}): Promise<{
  database: Database;
  spanner: Spanner;
  stop: () => Promise<void>;
}> {
  const releaseLock = await acquireSpannerEnvLock();
  const container = new GenericContainer(
    "gcr.io/cloud-spanner-emulator/emulator",
  )
    .withExposedPorts(SPANNER_EMULATOR_GRPC_PORT, SPANNER_EMULATOR_REST_PORT)
    .withWaitStrategy(Wait.forLogMessage("gRPC server listening"));
  const startedContainer = await container.start();
  let context: Awaited<ReturnType<typeof createSpannerDatabase>>;
  try {
    context = await createSpannerDatabase({ startedContainer, ...input });
  } catch (error) {
    try {
      await startedContainer.stop();
    } catch (stopError) {
      console.warn("Failed to stop Spanner emulator container", stopError);
    }
    releaseLock();
    throw error;
  }
  let stopped = false;
  return {
    database: context.database,
    spanner: context.spanner,
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        await context.database.close();
        context.spanner.close();
      } finally {
        context.restoreEmulatorHost();
        try {
          await startedContainer.stop();
        } finally {
          releaseLock();
        }
      }
    },
  };
}

function acquireSpannerEnvLock(): Promise<() => void> {
  let releaseCurrent: () => void = () => undefined;
  const previous = spannerEnvLock;
  spannerEnvLock = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  return previous.then(() => releaseCurrent);
}

async function createSpannerDatabase(input: {
  startedContainer: StartedTestContainer;
  instanceId: string;
  databaseId: string;
  tablePrefix: string;
  changeStreamName?: string;
}): Promise<{
  spanner: Spanner;
  database: Database;
  restoreEmulatorHost: () => void;
}> {
  const previousEmulatorHost = process.env.SPANNER_EMULATOR_HOST;
  const previousGoogleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const previousGcloudProject = process.env.GCLOUD_PROJECT;
  const previousMetadataServerDetection = process.env.METADATA_SERVER_DETECTION;
  process.env.SPANNER_EMULATOR_HOST = `localhost:${input.startedContainer.getMappedPort(
    SPANNER_EMULATOR_GRPC_PORT,
  )}`;
  process.env.GOOGLE_CLOUD_PROJECT = DEFAULT_PROJECT_ID;
  process.env.GCLOUD_PROJECT = DEFAULT_PROJECT_ID;
  process.env.METADATA_SERVER_DETECTION = "none";
  const spanner = new Spanner({ projectId: DEFAULT_PROJECT_ID });
  let createdInstance: Instance | undefined;
  let createdDatabase: Database | undefined;
  const restoreEmulatorHost = () => {
    restoreEnvValue("SPANNER_EMULATOR_HOST", previousEmulatorHost);
    restoreEnvValue("GOOGLE_CLOUD_PROJECT", previousGoogleCloudProject);
    restoreEnvValue("GCLOUD_PROJECT", previousGcloudProject);
    restoreEnvValue(
      "METADATA_SERVER_DETECTION",
      previousMetadataServerDetection,
    );
  };
  try {
    const [instance, instanceOperation] = await spanner.createInstance(
      input.instanceId,
      { config: "emulator-config", nodes: 1, displayName: "Example Instance" },
    );
    createdInstance = instance;
    await instanceOperation.promise();
    const [database, databaseOperation] = await instance.createDatabase(
      input.databaseId,
      { schema: createSpannerEventStoreSchema(input.tablePrefix) },
    );
    createdDatabase = database;
    await databaseOperation.promise();
    await insertSpannerConfig(database, input.tablePrefix);
    if (input.changeStreamName !== undefined) {
      const [changeStreamOperation] = await database.updateSchema([
        `CREATE CHANGE STREAM ${input.changeStreamName} FOR ${input.tablePrefix}_journal`,
      ]);
      await changeStreamOperation.promise();
    }
    return { spanner, database, restoreEmulatorHost };
  } catch (error) {
    if (createdDatabase !== undefined) {
      try {
        await createdDatabase.close();
      } catch (closeError) {
        console.warn("Failed to close Spanner emulator database", closeError);
      }
    }
    if (createdInstance !== undefined) {
      try {
        await createdInstance.delete();
      } catch (deleteError) {
        console.warn("Failed to delete Spanner emulator instance", deleteError);
      }
    }
    restoreEmulatorHost();
    spanner.close();
    throw error;
  }
}

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function insertSpannerConfig(
  database: Database,
  tablePrefix: string,
): Promise<void> {
  await database.runTransactionAsync(async (transaction) => {
    await transaction.run({
      sql: `INSERT INTO ${tablePrefix}_config (
        singleton, store_id, layout_version, keep_snapshot_count,
        retention_mode, ttl_grace_days, change_feed_enabled
      ) VALUES (1, GENERATE_UUID(), 1, NULL, 'delete', NULL, FALSE)`,
    });
    await transaction.commit();
  });
}

function createSpannerEventStoreSchema(tablePrefix: string): string[] {
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

export { createSpannerEventStoreSchema, startSpannerContainer };
