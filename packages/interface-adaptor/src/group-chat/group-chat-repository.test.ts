import { describe } from "node:test";
import { EventStoreFactory } from "event-store-adapter-js";
import { GroupChatRepository } from "./group-chat-repository";
import {
  GroupChatId,
  GroupChat,
  GroupChatName,
  UserAccountId,
  GroupChatEvent,
} from "cqrs-es-example-js-domain";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChatRepository", () => {
  test("store and reply", async () => {
    const eventStore = EventStoreFactory.ofMemory<
      GroupChatId,
      GroupChat,
      GroupChatEvent
    >();
    const repository = GroupChatRepository.of(eventStore);

    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat1, groupChatCreated] = GroupChat.create(id, name, adminId);

    await repository.storeEventAndSnapshot(groupChatCreated, groupChat1);

    const groupChat2 = await repository.findById(id);
    if (groupChat2 === undefined) {
      throw new Error("groupChat2 is undefined");
    }

    expect(groupChat2.id).toEqual(id);
  });
});
