import { describe } from "node:test";
import { GroupChatRepository } from "./group-chat-repository";
import * as E from "fp-ts/lib/Either";
import {
  GroupChatId,
  GroupChat,
  GroupChatName,
  UserAccountId,
  GroupChatEvent,
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-domain";
import {
  GenericContainer,
  StartedTestContainer,
  TestContainer,
  Wait,
} from "testcontainers";
import { EventStoreForDynamoDB } from "event-store-adapter-js/dist/internal/event-store-for-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  createDynamoDBClient,
  createJournalTable,
  createSnapshotTable,
} from "../test/dynamodb-utils";
import {
  Event,
  Aggregate,
  AggregateId,
  EventSerializer,
  KeyResolver,
  SnapshotSerializer,
} from "event-store-adapter-js";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChatRepository", () => {
  const TEST_TIME_FACTOR = parseFloat(process.env.TEST_TIME_FACTOR ?? "1.0");
  const TIMEOUT: number = 10 * 1000 * TEST_TIME_FACTOR;

  let container: TestContainer;
  let startedContainer: StartedTestContainer;
  let eventStore: EventStoreForDynamoDB<GroupChatId, GroupChat, GroupChatEvent>;

  const JOURNAL_TABLE_NAME = "journal";
  const SNAPSHOT_TABLE_NAME = "snapshot";
  const JOURNAL_AID_INDEX_NAME = "journal-aid-index";
  const SNAPSHOTS_AID_INDEX_NAME = "snapshots-aid-index";

  function createEventStore(
    dynamodbClient: DynamoDBClient,
  ): EventStoreForDynamoDB<GroupChatId, GroupChat, GroupChatEvent> {
    return new EventStoreForDynamoDB<GroupChatId, GroupChat, GroupChatEvent>(
      dynamodbClient,
      JOURNAL_TABLE_NAME,
      SNAPSHOT_TABLE_NAME,
      JOURNAL_AID_INDEX_NAME,
      SNAPSHOTS_AID_INDEX_NAME,
      32,
      convertJSONToGroupChatEvent,
      convertJSONToGroupChat,
      undefined,
      undefined,
      new CustomKeyResolver(),
      new CustomJsonEventSerializer<GroupChatId, GroupChatEvent>(),
      new CustomJsonSnapshotSerializer<GroupChatId, GroupChat>(),
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
    const repository = GroupChatRepository.of(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);
    await repository.storeEventAndSnapshot(groupChatCreated, groupChat1);

    const name2 = GroupChatName.of("name2");
    const renameEither = groupChat1.rename(name2, adminId);
    if (E.isLeft(renameEither)) {
      throw new Error(`renameEither is left: ${renameEither.left.message}`);
    }
    const [, groupChatRenamed] = renameEither.right;
    await repository.storeEvent(groupChatRenamed, groupChat1.version);

    const groupChat3 = await repository.findById(id);
    if (groupChat3 === undefined) {
      throw new Error("groupChat2 is undefined");
    }

    expect(groupChat3.id.equals(id)).toEqual(true);
    expect(groupChat3.name.equals(name2)).toEqual(true);
  });
});

class CustomJsonEventSerializer<AID extends AggregateId, E extends Event<AID>>
  implements EventSerializer<AID, E>
{
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deserialize(bytes: Uint8Array, converter: (json: any) => E): E {
    const jsonString = this.decoder.decode(bytes);
    const json = JSON.parse(jsonString);
    return converter(json);
  }

  serialize(event: E): Uint8Array {
    const jsonString = JSON.stringify({
      type: event.typeName,
      data: event,
    });
    return this.encoder.encode(jsonString);
  }
}

class CustomJsonSnapshotSerializer<
  AID extends AggregateId,
  A extends Aggregate<A, AID>,
> implements SnapshotSerializer<AID, A>
{
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deserialize(bytes: Uint8Array, converter: (json: any) => A): A {
    const jsonString = this.decoder.decode(bytes);
    const json = JSON.parse(jsonString);
    return converter(json);
  }

  serialize(aggregate: A): Uint8Array {
    const jsonString = JSON.stringify({
      type: aggregate.typeName,
      data: aggregate,
    });
    return this.encoder.encode(jsonString);
  }
}
class CustomKeyResolver<AID extends AggregateId> implements KeyResolver<AID> {
  private hashString(str: string): number {
    if (str === undefined || str === null) {
      throw new Error(`str is undefined or null: ${str}`);
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash >>> 0; // Convert to unsigned 32bit integer
  }

  resolvePartitionKey(aggregateId: AID, shardCount: number): string {
    if (aggregateId === undefined || aggregateId === null) {
      throw new Error(`aggregateId is undefined or null: ${aggregateId}`);
    }
    const hash = this.hashString(aggregateId.asString);
    const remainder = hash % shardCount;
    return `${aggregateId.typeName}-${remainder}`;
  }

  resolveSortKey(aggregateId: AID, sequenceNumber: number): string {
    return `${aggregateId.typeName}-${aggregateId.value}-${sequenceNumber}`;
  }
}
