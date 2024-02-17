import { describe } from "node:test";
import { GroupChat } from "./group-chat";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { UserAccountId } from "../user-account";
import * as E from "fp-ts/lib/Either";
import {
  GroupChatDeleted,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
} from "./group-chat-events";
import {
  GroupChatAddMemberError,
  GroupChatDeleteError,
  GroupChatRemoveMemberError,
} from "./group-chat-errors";

afterEach(() => {
  jest.useRealTimers();
});

describe("GroupChat", () => {
  test("Create", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    expect(groupChat.id).toEqual(id);
    expect(groupChat.name).toEqual(name);
  });
  test("Delete", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);

    const deleteEither = groupChat.delete(adminId);

    const [actualGroupChat, groupChatDeleted] = E.fold(
      (err: GroupChatDeleteError) => {
        throw new Error(err.message);
      },
      (values: [GroupChat, GroupChatDeleted]) => {
        return values;
      },
    )(deleteEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(groupChatDeleted.aggregateId).toEqual(id);
  });
  test("AddMember", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();

    const memberEither = groupChat.addMember(memberId, "member", adminId);

    expect(E.isRight(memberEither)).toEqual(true);
    const [actualGroupChat, groupChatMemberAdded] = E.fold(
      (err: GroupChatAddMemberError) => {
        throw new Error(err.message);
      },
      (values: [GroupChat, GroupChatMemberAdded]) => {
        return values;
      },
    )(memberEither);
    expect(actualGroupChat.id).toEqual(id);
    expect(actualGroupChat.members.contains(memberId)).toEqual(true);
    expect(groupChatMemberAdded.aggregateId).toEqual(id);
    expect(groupChatMemberAdded.member.userAccountId).toEqual(memberId);
  });
  test("RemoveMember", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.create(id, name, adminId);
    const memberId = UserAccountId.generate();
    const memberEither = groupChat.addMember(memberId, "member", adminId);
    const [actualGroupChat] = E.fold(
      (err: GroupChatAddMemberError) => {
        throw new Error(err.message);
      },
      (values: [GroupChat, GroupChatMemberAdded]) => {
        return values;
      },
    )(memberEither);

    const removeEither = actualGroupChat.removeMemberById(memberId, adminId);

    expect(E.isRight(removeEither)).toEqual(true);
    const [actualGroupChat2, groupChatMemberRemoved] = E.fold(
      (err: GroupChatRemoveMemberError) => {
        throw new Error(err.message);
      },
      (values: [GroupChat, GroupChatMemberRemoved]) => {
        return values;
      },
    )(removeEither);
    expect(actualGroupChat2.id).toEqual(id);
    expect(actualGroupChat2.members.contains(memberId)).toEqual(false);
    expect(groupChatMemberRemoved.aggregateId).toEqual(id);
    expect(groupChatMemberRemoved.member.userAccountId).toEqual(memberId);
  });
});
