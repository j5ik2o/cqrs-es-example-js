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
import { startSpannerContainer } from "../../test/spanner-utils";
import { GroupChatRepository } from "./group-chat-repository";

function ok<T>(result: Result<T, { message: string }>): T {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("GroupChatRepository (Spanner)", () => {
  const TEST_TIME_FACTOR = Number.parseFloat(
    process.env.TEST_TIME_FACTOR ?? "1.0",
  );
  const TIMEOUT: number = 120 * 1000 * TEST_TIME_FACTOR;

  const JOURNAL_TABLE_NAME = "journal";
  const SNAPSHOT_TABLE_NAME = "snapshot";

  let spanner: Awaited<ReturnType<typeof startSpannerContainer>> | undefined;
  let eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>;

  beforeAll(async () => {
    spanner = await startSpannerContainer({
      instanceId: "test-instance",
      databaseId: "test-database",
      journalTableName: JOURNAL_TABLE_NAME,
      snapshotTableName: SNAPSHOT_TABLE_NAME,
    });
    eventStore = EventStore.createSpanner<
      GroupChatId,
      GroupChat,
      GroupChatEvent
    >({
      database: spanner.database,
      journalTableName: JOURNAL_TABLE_NAME,
      snapshotTableName: SNAPSHOT_TABLE_NAME,
      shardCount: 32,
      eventConverter: convertJSONToGroupChatEvent,
      snapshotConverter: convertJSONToGroupChat,
    });
  }, TIMEOUT);

  afterAll(async () => {
    if (spanner !== undefined) {
      await spanner.stop();
    }
  }, TIMEOUT);

  test(
    "store and reply",
    async () => {
      const repository = GroupChatRepository.create(eventStore);

      const id = GroupChatId.generate();
      const name = GroupChatName.of("name");
      const adminId = UserAccountId.generate();
      const [groupChat1, created] = GroupChat.create(id, name, adminId);
      ok(await repository.storeEventAndSnapshot(created, groupChat1));

      const name2 = GroupChatName.of("name2");
      const [groupChat2, renamed] = ok(groupChat1.rename(name2, adminId));
      ok(await repository.store(renamed, groupChat2));

      const found = await repository.findById(id);
      if (found === undefined) {
        throw new Error("group chat is undefined");
      }
      expect(GroupChatId.equals(found.id, id)).toEqual(true);
      expect(GroupChatName.equals(found.name, name2)).toEqual(true);
      expect(found.version).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "optimistic lock conflict is reported as an error result",
    async () => {
      const repository = GroupChatRepository.create(eventStore);

      const id = GroupChatId.generate();
      const name = GroupChatName.of("name");
      const adminId = UserAccountId.generate();
      const [groupChat1, created] = GroupChat.create(id, name, adminId);
      ok(await repository.storeEventAndSnapshot(created, groupChat1));

      const [, renamedA] = ok(
        groupChat1.rename(GroupChatName.of("a"), adminId),
      );
      const [, renamedB] = ok(
        groupChat1.rename(GroupChatName.of("b"), adminId),
      );
      ok(await repository.storeEvent(renamedA, groupChat1.version));

      const conflict = await repository.storeEvent(
        renamedB,
        groupChat1.version,
      );
      expect(conflict.type).toEqual("err");
      if (conflict.type === "err") {
        expect(conflict.error.type).toEqual("optimistic-lock-conflict");
      }
    },
    TIMEOUT,
  );
});
