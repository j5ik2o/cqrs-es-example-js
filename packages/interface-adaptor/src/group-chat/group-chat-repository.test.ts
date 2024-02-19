import { describe } from "node:test";
import { EventStoreFactory } from "event-store-adapter-js";
import { GroupChatId } from "domain/dist/group-chat";
import { GroupChat } from "domain/dist/group-chat/group-chat";
import { GroupChatEvent } from "domain/dist/group-chat/group-chat-events";
import { GroupChatRepository } from "./group-chat-repository";
import { GroupChatName } from "domain/dist/group-chat/group-chat-name";
import { UserAccountId } from "domain/dist";

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
