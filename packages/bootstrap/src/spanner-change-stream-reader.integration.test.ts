import "reflect-metadata";
import { type Database, type Instance, Spanner } from "@google-cloud/spanner";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import { GroupChatRepository } from "cqrs-es-example-js-command-interface-adaptor-impl";
import { EventStore } from "event-store-adapter-js";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { createChangeStreamReader } from "./spanner-change-stream-reader";

/**
 * End-to-end proof of the Spanner CDC read path used by the bridge:
 * persist a domain event via EventStore.createSpanner, then read it back through
 * the change stream with the low-level single-use reader and decode it to the
 * same GroupChatEvent. This ties the write side, the journal payload format, and
 * the bridge's read primitive together.
 */
describe("Spanner change-stream reader (write -> change stream -> event)", () => {
  const TIMEOUT = 120 * 1000;
  const GRPC_PORT = 9010;
  const REST_PORT = 9020;
  const PROJECT_ID = "test-project";
  const INSTANCE_ID = "csr-instance";
  const DATABASE_ID = "csr-db";
  const STREAM = "journal_stream";
  const JOURNAL = "journal";
  const SNAPSHOT = "snapshot";

  let started: StartedTestContainer | undefined;
  let spanner: Spanner | undefined;
  let database: Database | undefined;
  const prevHost = process.env.SPANNER_EMULATOR_HOST;

  afterAll(async () => {
    await database?.close().catch(() => undefined);
    spanner?.close();
    process.env.SPANNER_EMULATOR_HOST = prevHost ?? "";
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
        { schema: eventStoreSchema(JOURNAL, SNAPSHOT) },
      );
      await dbOp.promise();
      database = db as Database;
      const [csOp] = await database.updateSchema([
        `CREATE CHANGE STREAM ${STREAM} FOR ${JOURNAL}`,
      ]);
      await csOp.promise();

      const eventStore = EventStore.createSpanner<
        GroupChatId,
        GroupChat,
        GroupChatEvent
      >({
        database,
        journalTableName: JOURNAL,
        snapshotTableName: SNAPSHOT,
        shardCount: 32,
        eventConverter: convertJSONToGroupChatEvent,
        snapshotConverter: convertJSONToGroupChat,
      });
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

      // Let the change record settle, then read the window with the bridge's
      // reader.
      await new Promise((r) => setTimeout(r, 1500));
      const reader = createChangeStreamReader(spanner, {
        projectId: PROJECT_ID,
        instanceId: INSTANCE_ID,
        databaseId: DATABASE_ID,
        streamName: STREAM,
      });
      let events: GroupChatEvent[];
      try {
        const records = await reader.readWindow(
          start.toISOString(),
          new Date(Date.now() + 1000).toISOString(),
        );
        events = records
          .filter((r) => r.tableName === JOURNAL && r.modType === "INSERT")
          .map((r) => {
            const payloadJson = Buffer.from(
              String(r.newValues.payload),
              "base64",
            ).toString("utf-8");
            return convertJSONToGroupChatEvent(JSON.parse(payloadJson));
          });
      } finally {
        await reader.close();
      }

      const createdEvent = events.find(
        (e) => e.typeName === "GroupChatCreated",
      );
      expect(createdEvent).toBeDefined();
      expect(createdEvent?.aggregateId.asString()).toEqual(id.asString());
    },
    TIMEOUT,
  );
});

function eventStoreSchema(journal: string, snapshot: string): string[] {
  return [
    `CREATE TABLE ${journal} (
      shard_id INT64 NOT NULL,
      aggregate_id STRING(MAX) NOT NULL,
      sequence_number INT64 NOT NULL,
      payload BYTES(MAX) NOT NULL,
      occurred_at TIMESTAMP NOT NULL
    ) PRIMARY KEY (shard_id, aggregate_id, sequence_number)`,
    `CREATE TABLE ${snapshot} (
      shard_id INT64 NOT NULL,
      aggregate_id STRING(MAX) NOT NULL,
      sequence_number INT64 NOT NULL,
      version INT64 NOT NULL,
      payload BYTES(MAX) NOT NULL,
      updated_at TIMESTAMP NOT NULL
    ) PRIMARY KEY (shard_id, aggregate_id, sequence_number)`,
  ];
}
