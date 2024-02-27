import { describe } from "node:test";
import { GroupChatRepositoryImpl } from "./group-chat-repository";
import * as E from "fp-ts/lib/Either";
import {
  GroupChatId,
  GroupChat,
  GroupChatName,
  UserAccountId,
  GroupChatEvent,
  convertJSONToGroupChatEvent,
  convertJSONToGroupChat,
} from "cqrs-es-example-js-command-domain";
import {
  GenericContainer,
  StartedTestContainer,
  TestContainer,
  Wait,
} from "testcontainers";
import { EventStore, EventStoreFactory } from "event-store-adapter-js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  createDynamoDBClient,
  createJournalTable,
  createSnapshotTable,
} from "../../test/dynamodb-utils";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChatRepository", () => {
  const TEST_TIME_FACTOR = parseFloat(process.env.TEST_TIME_FACTOR ?? "1.0");
  const TIMEOUT: number = 10 * 1000 * TEST_TIME_FACTOR;

  let container: TestContainer;
  let startedContainer: StartedTestContainer;
  let eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>;

  const JOURNAL_TABLE_NAME = "journal";
  const SNAPSHOT_TABLE_NAME = "snapshot";
  const JOURNAL_AID_INDEX_NAME = "journal-aid-index";
  const SNAPSHOTS_AID_INDEX_NAME = "snapshots-aid-index";

  function createEventStore(
    dynamodbClient: DynamoDBClient,
  ): EventStore<GroupChatId, GroupChat, GroupChatEvent> {
    return EventStoreFactory.ofDynamoDB<GroupChatId, GroupChat, GroupChatEvent>(
      dynamodbClient,
      JOURNAL_TABLE_NAME,
      SNAPSHOT_TABLE_NAME,
      JOURNAL_AID_INDEX_NAME,
      SNAPSHOTS_AID_INDEX_NAME,
      32,
      convertJSONToGroupChatEvent,
      convertJSONToGroupChat,
    );
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
      SNAPSHOTS_AID_INDEX_NAME,
    );
    eventStore = createEventStore(dynamodbClient);
  }, TIMEOUT);

  afterAll(async () => {
    if (startedContainer !== undefined) {
      await startedContainer.stop();
    }
  }, TIMEOUT);

  test("store and reply", async () => {
    const repository = GroupChatRepositoryImpl.of(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    const result = await repository.storeEventAndSnapshot(
      groupChatCreated,
      groupChat1,
    )();
    if (E.isLeft(result)) {
      throw new Error(result.left.message);
    }

    const name2 = GroupChatName.of("name2");
    const renameEither = groupChat1.rename(name2, adminId);
    if (E.isLeft(renameEither)) {
      throw new Error(
        `groupChat3Either is left: ${renameEither.left.stack?.toString()}`,
      );
    }
    const [, groupChatRenamed] = renameEither.right;
    const result2 = await repository.storeEvent(
      groupChatRenamed,
      groupChat1.version,
    )();
    if (E.isLeft(result2)) {
      throw new Error(result2.left.message);
    }

    const groupChat3Either = await repository.findById(id)();
    if (E.isLeft(groupChat3Either)) {
      throw new Error(
        `groupChat3Either is left: ${groupChat3Either.left.stack?.toString()}`,
      );
    }
    const groupChat3 = groupChat3Either.right;
    if (groupChat3 === undefined) {
      throw new Error("groupChat2 is undefined");
    }

    expect(groupChat3.id.equals(id)).toEqual(true);
    expect(groupChat3.name.equals(name2)).toEqual(true);
  });
});
