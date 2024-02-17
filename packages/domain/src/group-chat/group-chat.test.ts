import { describe } from "node:test";
import { GroupChat } from "./group-chat";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { UserAccountId } from "../user-account";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChat", () => {
  test("Create", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.of(id, name, adminId);
    expect(groupChat.id).toEqual(id);
    expect(groupChat.name).toEqual(name);
  });
});
