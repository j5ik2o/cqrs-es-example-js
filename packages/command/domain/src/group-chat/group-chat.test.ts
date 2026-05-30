import type { Result } from "event-store-adapter-js/dist/result";
import { UserAccountId } from "../user-account";
import { GroupChat } from "./group-chat";
import type { GroupChatError } from "./group-chat-errors";
import type { GroupChatEvent } from "./group-chat-events";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { Message } from "./message";
import { MessageId } from "./message-id";
import { Messages } from "./messages";

describe("GroupChat", () => {
  test("Create", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();

    const [groupChat, groupChatCreated] = GroupChat.create(id, name, adminId);

    expect(groupChat.id).toEqual(id);
    expect(groupChat.name).toEqual(name);
    expect(Members.containsById(groupChat.members, adminId)).toEqual(true);
    expect(groupChatCreated.aggregateId).toEqual(id);
    expect(groupChatCreated.name).toEqual(name);
  });

  test("Rename", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const newName = GroupChatName.of("newName");

    const [actualGroupChat, groupChatRenamed] = unwrap(
      groupChat.rename(newName, adminId),
    );

    expect(actualGroupChat.id).toEqual(id);
    expect(actualGroupChat.name).toEqual(newName);
    expect(groupChatRenamed.aggregateId).toEqual(id);
    expect(groupChatRenamed.name).toEqual(newName);
  });

  test("AddMember", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();

    const [actualGroupChat, groupChatMemberAdded] = unwrap(
      groupChat.addMember(memberId, "member", adminId),
    );

    expect(actualGroupChat.id).toEqual(id);
    expect(Members.containsById(actualGroupChat.members, memberId)).toEqual(
      true,
    );
    expect(groupChatMemberAdded.aggregateId).toEqual(id);
    expect(groupChatMemberAdded.member.userAccountId).toEqual(memberId);
  });

  test("RemoveMember", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const [actualGroupChat1] = unwrap(
      groupChat.addMember(memberId, "member", adminId),
    );
    expect(Members.containsById(actualGroupChat1.members, memberId)).toEqual(
      true,
    );

    const [actualGroupChat2, groupChatMemberRemoved] = unwrap(
      actualGroupChat1.removeMemberById(memberId, adminId),
    );

    expect(actualGroupChat2.id).toEqual(id);
    expect(Members.containsById(actualGroupChat2.members, memberId)).toEqual(
      false,
    );
    expect(groupChatMemberRemoved.aggregateId).toEqual(id);
    expect(groupChatMemberRemoved.member.userAccountId).toEqual(memberId);
  });

  test("PostMessage", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const [actualGroupChat1] = unwrap(
      groupChat.addMember(memberId, "member", adminId),
    );
    const message = Message.of(
      MessageId.generate(),
      "content",
      memberId,
      new Date(),
    );

    const [actualGroupChat2] = unwrap(
      actualGroupChat1.postMessage(message, memberId),
    );

    expect(actualGroupChat2.id).toEqual(id);
    expect(Messages.size(actualGroupChat2.messages)).toEqual(1);
    expect(Messages.toArray(actualGroupChat2.messages)[0].id).toEqual(
      message.id,
    );
  });

  test("DeleteMessage", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const [actualGroupChat1] = unwrap(
      groupChat.addMember(memberId, "member", adminId),
    );
    const message = Message.of(
      MessageId.generate(),
      "content",
      memberId,
      new Date(),
    );
    const [actualGroupChat2] = unwrap(
      actualGroupChat1.postMessage(message, memberId),
    );
    expect(Messages.size(actualGroupChat2.messages)).toEqual(1);

    const [actualGroupChat3, groupChatMessageDeleted] = unwrap(
      actualGroupChat2.deleteMessage(message.id, memberId),
    );

    expect(actualGroupChat3.id).toEqual(id);
    expect(Messages.size(actualGroupChat3.messages)).toEqual(0);
    expect(groupChatMessageDeleted.aggregateId).toEqual(id);
    expect(groupChatMessageDeleted.message.id).toEqual(message.id);
  });

  test("Delete", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);

    const [actualGroupChat, groupChatDeleted] = unwrap(
      groupChat.delete(adminId),
    );

    expect(actualGroupChat.id).toEqual(id);
    expect(groupChatDeleted.aggregateId).toEqual(id);
    expect(groupChatDeleted.typeName).toEqual("GroupChatDeleted");
  });
});

function unwrap<E extends GroupChatError, Ev extends GroupChatEvent>(
  result: Result<[GroupChat, Ev], E>,
): [GroupChat, Ev] {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}
