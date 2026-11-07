import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { EventStore, type Result } from "event-store-adapter-js";
import {
  GenericContainer,
  type StartedTestContainer,
  type TestContainer,
  Wait,
} from "testcontainers";
import {
  createDynamoDBClient,
  createHeadTable,
  createJournalTable,
  createSnapshotTable,
} from "../../test/dynamodb-utils";
import { GroupChatRepository } from "./group-chat-repository";
import {
  groupChatEventSerializer,
  groupChatSnapshotSerializer,
} from "./group-chat-serializers";

function ok<T>(result: Result<T, { message: string }>): T {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("GroupChatRepository", () => {
  const TEST_TIME_FACTOR = Number.parseFloat(
    process.env.TEST_TIME_FACTOR ?? "1.0",
  );
  const TIMEOUT: number = 60 * 1000 * TEST_TIME_FACTOR;

  let container: TestContainer;
  let startedContainer: StartedTestContainer;
  let dynamodbClient: DynamoDBClient;
  let eventStore: EventStore<GroupChatEvent, GroupChat>;

  const JOURNAL_TABLE_NAME = "journal";
  const SNAPSHOT_TABLE_NAME = "snapshot";
  const HEAD_TABLE_NAME = "head";
  const SNAPSHOT_HISTORY_INDEX_NAME = "snapshot-history-index";

  async function createEventStore(
    dynamodbClient: DynamoDBClient,
  ): Promise<EventStore<GroupChatEvent, GroupChat>> {
    const result = await EventStore.createDynamoDB<GroupChatEvent, GroupChat>({
      client: dynamodbClient,
      tables: {
        journal: JOURNAL_TABLE_NAME,
        snapshot: SNAPSHOT_TABLE_NAME,
        head: HEAD_TABLE_NAME,
      },
      snapshotAidIndexName: SNAPSHOT_HISTORY_INDEX_NAME,
      eventSerializer: groupChatEventSerializer,
      snapshotSerializer: groupChatSnapshotSerializer,
    });
    if (result.type === "err") {
      throw new Error(`${result.error.type}: ${result.error.message}`);
    }
    return result.value;
  }

  beforeAll(async () => {
    container = new GenericContainer("localstack/localstack:2.3.2")
      .withEnvironment({
        SERVICES: "dynamodb",
        DEFAULT_REGION: "us-west-1",
        EAGER_SERVICE_LOADING: "1",
        DYNAMODB_SHARED_DB: "1",
        DYNAMODB_IN_MEMORY: "1",
      })
      .withWaitStrategy(Wait.forLogMessage("Ready."))
      .withExposedPorts(4566);
    startedContainer = await container.start();
    dynamodbClient = createDynamoDBClient(startedContainer);
    await createJournalTable(dynamodbClient, JOURNAL_TABLE_NAME);
    await createSnapshotTable(
      dynamodbClient,
      SNAPSHOT_TABLE_NAME,
      SNAPSHOT_HISTORY_INDEX_NAME,
    );
    await createHeadTable(dynamodbClient, HEAD_TABLE_NAME);
    eventStore = await createEventStore(dynamodbClient);
  }, TIMEOUT);

  afterAll(async () => {
    if (startedContainer !== undefined) {
      await startedContainer.stop();
    }
  }, TIMEOUT);

  test("store and reply", async () => {
    const repository = GroupChatRepository.create(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    ok(await repository.storeEventAndSnapshot(groupChatCreated, groupChat1));

    const name2 = GroupChatName.of("name2");
    const [groupChat2, groupChatRenamed] = ok(
      groupChat1.rename(name2, adminId),
    );
    ok(await repository.store(groupChatRenamed, groupChat2));

    const groupChat3 = await repository.findById(id);
    if (groupChat3 === undefined) {
      throw new Error("groupChat3 is undefined");
    }
    expect(GroupChatId.equals(groupChat3.id, id)).toEqual(true);
    expect(GroupChatName.equals(groupChat3.name, name2)).toEqual(true);
  });

  test("store and reply: store method calling only", async () => {
    const repository = GroupChatRepository.create(eventStore).withRetention(3);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    expect(groupChat1.sequenceNumber).toEqual(1);
    ok(await repository.store(groupChatCreated, groupChat1));

    const groupChat2 = await repository.findById(id);
    expect(groupChat2?.sequenceNumber).toEqual(1);
    if (groupChat2 === undefined) {
      throw new Error("groupChat2 is undefined");
    }

    const name2 = GroupChatName.of("name2");
    const [groupChat3, groupChatRenamed] = ok(
      groupChat2.rename(name2, adminId),
    );
    expect(groupChat3.sequenceNumber).toEqual(2);
    ok(await repository.store(groupChatRenamed, groupChat3));

    const groupChat4 = await repository.findById(id);
    expect(groupChat4?.id && GroupChatId.equals(groupChat4.id, id)).toEqual(
      true,
    );
    expect(groupChat4 && GroupChatName.equals(groupChat4.name, name2)).toEqual(
      true,
    );
    expect(groupChat4?.sequenceNumber).toEqual(2);
  });

  test("optimistic lock conflict is reported as an error result", async () => {
    const repository = GroupChatRepository.create(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    ok(await repository.storeEventAndSnapshot(groupChatCreated, groupChat1));

    // Two concurrent renames from the same base sequence number (1).
    const [groupChatA, renamedA] = ok(
      groupChat1.rename(GroupChatName.of("a"), adminId),
    );
    const [groupChatB, renamedB] = ok(
      groupChat1.rename(GroupChatName.of("b"), adminId),
    );
    ok(await repository.storeEvent(renamedA, groupChatA));

    const conflict = await repository.storeEvent(renamedB, groupChatB);
    expect(conflict.type).toEqual("err");
    if (conflict.type === "err") {
      expect(conflict.error.type).toEqual("optimistic-lock-conflict");
    }
  });

  test("writes v5 envelope metadata to journal, head and snapshot", async () => {
    const repository = GroupChatRepository.create(eventStore);

    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [groupChat1, created] = GroupChat.create(
      id,
      GroupChatName.of("name"),
      adminId,
    );
    ok(await repository.store(created, groupChat1));

    const journal1 = await getItem(JOURNAL_TABLE_NAME, {
      aid: { S: id.asString() },
      seq_nr: { N: "1" },
    });
    expect(journal1.Item?.manifest?.S).toEqual("GroupChatCreated@1");
    expect(journal1.Item?.occurred_at?.N).toBeDefined();
    const eventPayload = decodeItemPayload(journal1.Item);
    expect(eventPayload.typeName).toEqual("GroupChatCreated");
    for (const key of [
      "aggregateId",
      "aggregate_id",
      "sequenceNumber",
      "seq_nr",
      "occurredAt",
      "occurred_at",
      "isCreated",
    ]) {
      expect(eventPayload).not.toHaveProperty(key);
    }

    const head1 = await getItem(HEAD_TABLE_NAME, {
      aid: { S: id.asString() },
    });
    expect(head1.Item?.seq_nr?.N).toEqual("1");
    expect(head1.Item?.type_name?.S).toEqual("GroupChat");
    const headEvent1 = head1.Item?.events?.L?.[0]?.M;
    expect(headEvent1?.seq_nr?.N).toEqual("1");
    expect(headEvent1?.manifest?.S).toEqual("GroupChatCreated@1");

    const snapshot1 = await getItem(SNAPSHOT_TABLE_NAME, {
      aid: { S: id.asString() },
      skey: { N: "0" },
    });
    expect(snapshot1.Item?.seq_nr?.N).toEqual("1");
    expect(snapshot1.Item?.manifest?.S).toEqual("GroupChat@1");
    const snapshotPayload = decodeItemPayload(snapshot1.Item);
    expect(snapshotPayload).not.toHaveProperty("version");
    expect(snapshotPayload).not.toHaveProperty("manifest");
    expect(snapshotPayload).not.toHaveProperty("typeName");
    expect(snapshotPayload.sequenceNumber).toEqual(1);

    const [groupChat2, renamed] = ok(
      groupChat1.rename(GroupChatName.of("name2"), adminId),
    );
    ok(await repository.store(renamed, groupChat2));

    const journal2 = await getItem(JOURNAL_TABLE_NAME, {
      aid: { S: id.asString() },
      seq_nr: { N: "2" },
    });
    expect(journal2.Item?.manifest?.S).toEqual("GroupChatRenamed@1");

    const head2 = await getItem(HEAD_TABLE_NAME, {
      aid: { S: id.asString() },
    });
    expect(head2.Item?.seq_nr?.N).toEqual("2");
    const headEvent2 = head2.Item?.events?.L?.[0]?.M;
    expect(headEvent2?.seq_nr?.N).toEqual("2");
    expect(headEvent2?.manifest?.S).toEqual("GroupChatRenamed@1");
  });

  async function getItem(
    tableName: string,
    key: Record<string, { S: string } | { N: string }>,
  ) {
    return dynamodbClient.send(
      new GetItemCommand({ TableName: tableName, Key: key }),
    );
  }
});

function decodeItemPayload(
  item: { payload?: { B?: Uint8Array } } | undefined,
): Record<string, unknown> {
  const bytes = item?.payload?.B;
  if (bytes === undefined) {
    throw new Error("item is missing payload.B");
  }
  return JSON.parse(Buffer.from(bytes).toString("utf-8"));
}
