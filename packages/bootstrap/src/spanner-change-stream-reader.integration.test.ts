import "reflect-metadata";
import { type Database, type Instance, Spanner } from "@google-cloud/spanner";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import {
  GroupChatRepository,
  groupChatEventSerializer,
  groupChatSnapshotSerializer,
} from "cqrs-es-example-js-command-interface-adaptor-impl";
import type { EventStore } from "event-store-adapter-js";
import { SpannerEventStore } from "event-store-adapter-js/spanner";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { createChangeStreamReader } from "./spanner-change-stream-reader";

/**
 * End-to-end proof of the Spanner CDC read path used by the bridge:
 * persist a domain event via the ESA v5 Spanner store, then read it back
 * through the change stream with the low-level single-use reader and decode it
 * to the same GroupChatEvent. This ties the write side, the journal payload
 * format, and the bridge's read primitive together.
 */
describe("Spanner change-stream reader (write -> change stream -> event)", () => {
  const TIMEOUT = 120 * 1000;
  const GRPC_PORT = 9010;
  const REST_PORT = 9020;
  const PROJECT_ID = "test-project";
  const INSTANCE_ID = "csr-instance";
  const DATABASE_ID = "csr-db";
  const TABLE_PREFIX = "esa";
  const STREAM = "journal_stream";
  const JOURNAL = `${TABLE_PREFIX}_journal`;

  let started: StartedTestContainer | undefined;
  let spanner: Spanner | undefined;
  let database: Database | undefined;
  const prevHost = process.env.SPANNER_EMULATOR_HOST;

  afterAll(async () => {
    await database?.close().catch(() => undefined);
    spanner?.close();
    if (prevHost === undefined) {
      Reflect.deleteProperty(process.env, "SPANNER_EMULATOR_HOST");
    } else {
      process.env.SPANNER_EMULATOR_HOST = prevHost;
    }
    await started?.stop().catch(() => undefined);
  }, TIMEOUT);

  test(
    "a persisted GroupChatCreated event is read back from the change stream",
    async () => {
      started = await new GenericContainer(
        "gcr.io/cloud-spanner-emulator/emulator",
      )
        .withExposedPorts(GRPC_PORT, REST_PORT)
        .withWaitStrategy(Wait.forLogMessage("gRPC server listening"))
        .start();
      process.env.SPANNER_EMULATOR_HOST = `localhost:${started.getMappedPort(
        GRPC_PORT,
      )}`;
      process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      process.env.METADATA_SERVER_DETECTION = "none";

      spanner = new Spanner({ projectId: PROJECT_ID });
      const [instance, instanceOp] = await spanner.createInstance(INSTANCE_ID, {
        config: "emulator-config",
        nodes: 1,
        displayName: "csr",
      });
      await instanceOp.promise();
      const [db, dbOp] = await (instance as Instance).createDatabase(
        DATABASE_ID,
        { schema: eventStoreSchema(TABLE_PREFIX) },
      );
      await dbOp.promise();
      database = db as Database;
      await insertConfig(database, TABLE_PREFIX);
      const [csOp] = await database.updateSchema([
        `CREATE CHANGE STREAM ${STREAM} FOR ${JOURNAL}`,
      ]);
      await csOp.promise();

      const storeResult = await SpannerEventStore.create<
        GroupChatEvent,
        GroupChat
      >({
        database,
        tablePrefix: TABLE_PREFIX,
        eventSerializer: groupChatEventSerializer,
        snapshotSerializer: groupChatSnapshotSerializer,
      });
      if (storeResult.type === "err") {
        throw new Error(storeResult.error.message);
      }
      const eventStore: EventStore<GroupChatEvent, GroupChat> =
        storeResult.value;
      const repository = GroupChatRepository.create(eventStore);

      const start = new Date();
      const id = GroupChatId.generate();
      const adminId = UserAccountId.generate();
      const [groupChat, created] = GroupChat.create(
        id,
        GroupChatName.of("name"),
        adminId,
      );
      const result = await repository.storeEventAndSnapshot(created, groupChat);
      if (result.type === "err") {
        throw new Error(result.error.message);
      }

      const reader = createChangeStreamReader(spanner, {
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        databaseId: DATABASE_ID,
        streamName: STREAM,
      });
      let createdRecord:
        | { event: GroupChatEvent; aggregateId: string }
        | undefined;
      try {
        createdRecord = await readUntilEvent(
          reader,
          JOURNAL,
          start,
          (event) => event.typeName === "GroupChatCreated",
        );
      } finally {
        await reader.close();
      }

      expect(createdRecord).toBeDefined();
      expect(createdRecord?.event.typeName).toEqual("GroupChatCreated");
      expect(createdRecord?.aggregateId).toEqual(id.asString());
    },
    TIMEOUT,
  );
});

async function readUntilEvent(
  reader: ReturnType<typeof createChangeStreamReader>,
  journalTableName: string,
  start: Date,
  predicate: (event: GroupChatEvent) => boolean,
): Promise<{ event: GroupChatEvent; aggregateId: string } | undefined> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const records = await reader.readWindow(
      start.toISOString(),
      new Date(Date.now() + 1_000).toISOString(),
    );
    const record = records
      .filter((r) => r.tableName === journalTableName && r.modType === "INSERT")
      .map((r) => ({
        event: decodeEventPayload(
          Buffer.from(String(r.newValues.payload), "base64"),
        ),
        aggregateId: String(r.keys.aid ?? ""),
      }))
      .find((candidate) => predicate(candidate.event));
    if (record !== undefined) {
      return record;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}

async function insertConfig(
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

/**
 * The store serializes the domain event JSON as the payload. Decode it through
 * the domain's own converter so the test proves the payload contract, not just
 * the change-stream plumbing.
 */
function decodeEventPayload(payload: Buffer): GroupChatEvent {
  return convertJSONToGroupChatEvent(JSON.parse(payload.toString("utf-8")));
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
