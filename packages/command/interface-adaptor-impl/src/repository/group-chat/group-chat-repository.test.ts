import { describe } from "node:test";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
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
  createJournalTable,
  createSnapshotTable,
} from "../../test/dynamodb-utils";
import { GroupChatRepository } from "./group-chat-repository";

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
  let eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>;

  const JOURNAL_TABLE_NAME = "journal";
  const SNAPSHOT_TABLE_NAME = "snapshot";
  const JOURNAL_AID_INDEX_NAME = "journal-aid-index";
  const SNAPSHOT_AID_INDEX_NAME = "snapshot-aid-index";
  const SNAPSHOT_ACTIVE_TTL_INDEX_NAME = "snapshot-active-ttl-index";

  function createEventStore(
    dynamodbClient: DynamoDBClient,
  ): EventStore<GroupChatId, GroupChat, GroupChatEvent> {
    return EventStore.createDynamoDB<GroupChatId, GroupChat, GroupChatEvent>({
      client: dynamodbClient,
      journalTableName: JOURNAL_TABLE_NAME,
      snapshotTableName: SNAPSHOT_TABLE_NAME,
      journalAidIndexName: JOURNAL_AID_INDEX_NAME,
      snapshotAidIndexName: SNAPSHOT_AID_INDEX_NAME,
      snapshotActiveTtlIndexName: SNAPSHOT_ACTIVE_TTL_INDEX_NAME,
      shardCount: 32,
      eventConverter: convertJSONToGroupChatEvent,
      snapshotConverter: convertJSONToGroupChat,
    });
  }

  beforeAll(async () => {
    container = new GenericContainer("localstack/localstack:2.1.0")
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
    const dynamodbClient = createDynamoDBClient(startedContainer);
    await createJournalTable(
      dynamodbClient,
      JOURNAL_TABLE_NAME,
      JOURNAL_AID_INDEX_NAME,
    );
    await createSnapshotTable(
      dynamodbClient,
      SNAPSHOT_TABLE_NAME,
      SNAPSHOT_AID_INDEX_NAME,
      SNAPSHOT_ACTIVE_TTL_INDEX_NAME,
    );
    eventStore = createEventStore(dynamodbClient);
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
    expect(groupChat1.version).toEqual(1);
    ok(await repository.store(groupChatCreated, groupChat1));

    const groupChat2 = await repository.findById(id);
    expect(groupChat2?.version).toEqual(1);
    if (groupChat2 === undefined) {
      throw new Error("groupChat2 is undefined");
    }

    const name2 = GroupChatName.of("name2");
    const [groupChat3, groupChatRenamed] = ok(
      groupChat2.rename(name2, adminId),
    );
    expect(groupChat3.version).toEqual(1);
    ok(await repository.store(groupChatRenamed, groupChat3));

    const groupChat4 = await repository.findById(id);
    expect(groupChat4?.id && GroupChatId.equals(groupChat4.id, id)).toEqual(
      true,
    );
    expect(groupChat4 && GroupChatName.equals(groupChat4.name, name2)).toEqual(
      true,
    );
    expect(groupChat4?.version).toEqual(2);
  });

  test("optimistic lock conflict is reported as an error result", async () => {
    const repository = GroupChatRepository.create(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    ok(await repository.storeEventAndSnapshot(groupChatCreated, groupChat1));

    // Two concurrent renames from the same base version (1).
    const [, renamedA] = ok(groupChat1.rename(GroupChatName.of("a"), adminId));
    const [, renamedB] = ok(groupChat1.rename(GroupChatName.of("b"), adminId));
    ok(await repository.storeEvent(renamedA, groupChat1.version));

    const conflict = await repository.storeEvent(renamedB, groupChat1.version);
    expect(conflict.type).toEqual("err");
    if (conflict.type === "err") {
      expect(conflict.error.type).toEqual("optimistic-lock-conflict");
    }
  });
});
