import { describe } from "node:test";
import * as E from "fp-ts/lib/Either";
import { UserAccountId } from "../user-account";
import { GroupChat } from "./group-chat";
import type { GroupChatError } from "./group-chat-errors";
import {
  GroupChatDeletedTypeSymbol,
  type GroupChatEvent,
} from "./group-chat-events";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Message } from "./message";
import { MessageId } from "./message-id";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChat", () => {
  test("Create", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();

    // When
    const [groupChat, groupChatCreated] = GroupChat.create(id, name, adminId);

    // Then
    expect(groupChat.id).toEqual(id);
    expect(groupChat.name).toEqual(name);
    expect(groupChat.members.containsById(adminId)).toEqual(true);
    expect(groupChatCreated.aggregateId).toEqual(id);
    expect(groupChatCreated.name).toEqual(name);
  });
  test("Rename", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const newName = GroupChatName.of("newName");

    // When
    const renameEither = groupChat.rename(newName, adminId);

    // Then
    expect(E.isRight(renameEither)).toEqual(true);
    const [actualGroupChat, groupChatRenamed] = parseResult(renameEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(actualGroupChat.name).toEqual(newName);
    expect(groupChatRenamed.aggregateId).toEqual(id);
    expect(groupChatRenamed.name).toEqual(newName);
  });
  test("AddMember", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();

    // When
    const addMemberEither = groupChat.addMember(memberId, "member", adminId);

    // Then
    expect(E.isRight(addMemberEither)).toEqual(true);
    const [actualGroupChat, groupChatMemberAdded] =
      parseResult(addMemberEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(actualGroupChat.members.containsById(memberId)).toEqual(true);
    expect(groupChatMemberAdded.aggregateId).toEqual(id);
    expect(groupChatMemberAdded.member.userAccountId).toEqual(memberId);
  });
  test("RemoveMember", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const addMemberEither = groupChat.addMember(memberId, "member", adminId);
    const [actualGroupChat1] = parseResult(addMemberEither);
    expect(actualGroupChat1.id).toEqual(id);
    expect(actualGroupChat1.members.containsById(memberId)).toEqual(true);

    // When
    const removeEither = actualGroupChat1.removeMemberById(memberId, adminId);

    // Then
    expect(E.isRight(removeEither)).toEqual(true);
    const [actualGroupChat2, groupChatMemberRemoved] =
      parseResult(removeEither);
    expect(actualGroupChat2.id).toEqual(id);
    expect(actualGroupChat2.members.containsById(memberId)).toEqual(false);
    expect(groupChatMemberRemoved.aggregateId).toEqual(id);
    expect(groupChatMemberRemoved.member.userAccountId).toEqual(memberId);
  });
  test("PostMessage", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const addMemberEither = groupChat.addMember(memberId, "member", adminId);
    const [actualGroupChat1] = parseResult(addMemberEither);
    expect(actualGroupChat1.id).toEqual(id);
    expect(actualGroupChat1.members.containsById(memberId)).toEqual(true);
    const message = Message.of(
      MessageId.generate(),
      "content",
      memberId,
      new Date(),
    );

    // When
    const postMessageEither = actualGroupChat1.postMessage(message, memberId);

    // Then
    expect(E.isRight(postMessageEither)).toEqual(true);
    const [actualGroupChat2] = parseResult(postMessageEither);
    expect(actualGroupChat2.id).toEqual(id);
    expect(actualGroupChat2.messages.size()).toEqual(1);
    expect(actualGroupChat2.messages.toArray()[0].id).toEqual(message.id);
  });
  test("DeleteMessage", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const addMemberEither = groupChat.addMember(memberId, "member", adminId);
    const [actualGroupChat1] = parseResult(addMemberEither);
    expect(actualGroupChat1.id).toEqual(id);
    expect(actualGroupChat1.members.containsById(memberId)).toEqual(true);
    const message = Message.of(
      MessageId.generate(),
      "content",
      memberId,
      new Date(),
    );
    const postMessageEither = actualGroupChat1.postMessage(message, memberId);
    const [actualGroupChat2] = parseResult(postMessageEither);
    expect(actualGroupChat2.id).toEqual(id);
    expect(actualGroupChat2.messages.size()).toEqual(1);
    expect(actualGroupChat2.messages.toArray()[0].id).toEqual(message.id);

    // When
    const deleteMessageEither = actualGroupChat2.deleteMessage(
      message.id,
      memberId,
    );

    // Then
    expect(E.isRight(deleteMessageEither)).toEqual(true);
    const [actualGroupChat3, groupChatMessageDeleted] =
      parseResult(deleteMessageEither);
    expect(actualGroupChat3.id).toEqual(id);
    expect(actualGroupChat3.messages.size()).toEqual(0);
    expect(groupChatMessageDeleted.aggregateId).toEqual(id);
    expect(groupChatMessageDeleted.message.id).toEqual(message.id);
  });
  test("Delete", () => {
    // Given
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);

    // When
    const deleteEither = groupChat.delete(adminId);

    // Then
    expect(E.isRight(deleteEither)).toEqual(true);
    const [actualGroupChat, groupChatDeleted] = parseResult(deleteEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(groupChatDeleted.aggregateId).toEqual(id);
    expect(groupChatDeleted.symbol).toEqual(GroupChatDeletedTypeSymbol);
  });
});

function parseResult<
  Error extends GroupChatError,
  Event extends GroupChatEvent,
>(renameEither: E.Either<Error, [GroupChat, Event]>) {
  return E.fold(
    (err: Error) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, Event]) => {
      return values;
    },
  )(renameEither);
}
