import { describe } from "node:test";
import { GroupChat } from "./group-chat";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { UserAccountId } from "../user-account";
import * as E from "fp-ts/lib/Either";
import {
  GroupChatDeleted,
  GroupChatDeletedTypeSymbol,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessageDeleted,
  GroupChatMessagePosted,
  GroupChatRenamed,
} from "./group-chat-events";
import {
  GroupChatAddMemberError,
  GroupChatDeleteError,
  GroupChatDeleteMessageError,
  GroupChatPostMessageError,
  GroupChatRemoveMemberError,
  GroupChatRenameError,
} from "./group-chat-errors";
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
    const result = groupChat.rename(newName, adminId);
    const [actualGroupChat, groupChatRenamed] = parseRenameResult(result);
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
    const addMemberEither = groupChat.addMember(
      memberId,
      "member",
      adminId,
    );

    // Then
    expect(E.isRight(addMemberEither)).toEqual(true);
    const [actualGroupChat, groupChatMemberAdded] =
      parseAddMemberResult(addMemberEither);
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
    const addMemberEither = groupChat.addMember(
      memberId,
        "member",
      adminId,
    );
    const [actualGroupChat1] = parseAddMemberResult(addMemberEither);
    expect(actualGroupChat1.id).toEqual(id);
    expect(actualGroupChat1.members.containsById(memberId)).toEqual(true);

    // When
    const removeEither = actualGroupChat1.removeMemberById(memberId, adminId);

    // Then
    expect(E.isRight(removeEither)).toEqual(true);
    const [actualGroupChat2, groupChatMemberRemoved] =
      parseRemoveMemberResult(removeEither);
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
    const addMemberEither = groupChat.addMember(
      memberId,
        "member",
      adminId,
    );
    const [actualGroupChat1] = parseAddMemberResult(addMemberEither);
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
    const [actualGroupChat2] = parsePostMessageResult(postMessageEither);
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
    const addMemberEither = groupChat.addMember(
      memberId,
        "member",
      adminId,
    );
    const [actualGroupChat1] = parseAddMemberResult(addMemberEither);
    expect(actualGroupChat1.id).toEqual(id);
    expect(actualGroupChat1.members.containsById(memberId)).toEqual(true);
    const message = Message.of(
      MessageId.generate(),
      "content",
      memberId,
      new Date(),
    );
    const postMessageEither = actualGroupChat1.postMessage(message, memberId);
    const [actualGroupChat2] = parsePostMessageResult(postMessageEither);
    expect(actualGroupChat2.id).toEqual(id);
    expect(actualGroupChat2.messages.size()).toEqual(1);
    expect(actualGroupChat2.messages.toArray()[0].id).toEqual(message.id);

    // When
    const deleteMessageEither = actualGroupChat2.deleteMessage(
      message.id,
      memberId,
    );
    const [actualGroupChat3, groupChatMessageDeleted] =
      parseDeleteMessageResult(deleteMessageEither);
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
    const [actualGroupChat, groupChatDeleted] =
      parseDeleteGroupChatResult(deleteEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(groupChatDeleted.aggregateId).toEqual(id);
    expect(groupChatDeleted.symbol).toEqual(GroupChatDeletedTypeSymbol);
  });
});

function parseRenameResult(
  renameEither: E.Either<GroupChatRenameError, [GroupChat, GroupChatRenamed]>,
) {
  return E.fold(
    (err: GroupChatRenameError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatRenamed]) => {
      return values;
    },
  )(renameEither);
}

function parseAddMemberResult(
  addMemberEither: E.Either<
    GroupChatAddMemberError,
    [GroupChat, GroupChatMemberAdded]
  >,
) {
  return E.fold(
    (err: GroupChatAddMemberError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatMemberAdded]) => {
      return values;
    },
  )(addMemberEither);
}

function parseRemoveMemberResult(
  removeEither: E.Either<
    GroupChatRemoveMemberError,
    [GroupChat, GroupChatMemberRemoved]
  >,
) {
  return E.fold(
    (err: GroupChatRemoveMemberError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatMemberRemoved]) => {
      return values;
    },
  )(removeEither);
}

function parsePostMessageResult(
  postMessageEither: E.Either<
    GroupChatPostMessageError,
    [GroupChat, GroupChatMessagePosted]
  >,
) {
  return E.fold(
    (err: GroupChatPostMessageError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatMessagePosted]) => {
      return values;
    },
  )(postMessageEither);
}

function parseDeleteMessageResult(
  deleteMessageEither: E.Either<
    GroupChatDeleteMessageError,
    [GroupChat, GroupChatMessageDeleted]
  >,
) {
  return E.fold(
    (err: GroupChatDeleteMessageError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatMessageDeleted]) => {
      return values;
    },
  )(deleteMessageEither);
}

function parseDeleteGroupChatResult(
  deleteEither: E.Either<GroupChatDeleteError, [GroupChat, GroupChatDeleted]>,
) {
  return E.fold(
    (err: GroupChatDeleteError) => {
      throw new Error(err.message);
    },
    (values: [GroupChat, GroupChatDeleted]) => {
      return values;
    },
  )(deleteEither);
}
