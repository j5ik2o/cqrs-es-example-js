import { describe } from "node:test";
import {
  GroupChatAddMemberError,
  GroupChat,
  GroupChatDeleteError,
} from "./group-chat";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { UserAccountId } from "../user-account";
import * as E from "fp-ts/lib/Either";
import {
  GroupChatDeleted,
  GroupChatMemberAdded,
} from "./events/group-chat-events";

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
  test("Delete", () => {
    const id = GroupChatId.generate();
    const name = GroupChatName.of("name");
    const adminId = UserAccountId.generate();
    const [groupChat] = GroupChat.of(id, name, adminId);
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
    const [groupChat] = GroupChat.of(id, name, adminId);
    const memberId = UserAccountId.generate();

    const memberEither: E.Either<
      GroupChatAddMemberError,
      [GroupChat, GroupChatMemberAdded]
    > = groupChat.addMember(memberId, "member", adminId);

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
});
