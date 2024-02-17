import { Aggregate } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {
  GroupChatCreated,
  GroupChatDeleted,
  GroupChatMemberAdded,
} from "./events/group-chat-events";
import { UserAccountId } from "../user-account";
import { Member, MemberRole } from "./member";
import * as E from "fp-ts/lib/Either";

const GroupChatAddMemberErrorSymbol = Symbol("GroupChatAddMemberError");

class GroupChatAddMemberError {
  readonly symbol: typeof GroupChatAddMemberErrorSymbol =
    GroupChatAddMemberErrorSymbol;
  private constructor(public readonly message: string) {}
  static of(message: string): GroupChatAddMemberError {
    return new GroupChatAddMemberError(message);
  }
}

const GroupChatDeleteErrorSymbol = Symbol("GroupChatDeleteError");

class GroupChatDeleteError {
  readonly symbol: typeof GroupChatDeleteErrorSymbol =
    GroupChatDeleteErrorSymbol;
  private constructor(public readonly message: string) {}
  static of(message: string): GroupChatDeleteError {
    return new GroupChatDeleteError(message);
  }
}

type GroupChatError = GroupChatDeleteError | GroupChatAddMemberError;

const GroupChatSymbol = Symbol("GroupChat");

class GroupChat implements Aggregate<GroupChat, GroupChatId> {
  readonly symbol: typeof GroupChatSymbol = GroupChatSymbol;

  private constructor(
    public readonly id: GroupChatId,
    private readonly deleted: boolean,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly sequenceNumber: number,
    public readonly version: number,
  ) {}

  static of(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): [GroupChat, GroupChatCreated] {
    const members = Members.ofSingle(executorId);
    const sequenceNumber = 1;
    const version = 1;
    return [
      new GroupChat(id, false, name, members, sequenceNumber, version),
      GroupChatCreated.of(id, name, members, executorId, sequenceNumber),
    ];
  }

  private static from(
    id: GroupChatId,
    deleted: boolean,
    name: GroupChatName,
    members: Members,
    sequenceNumber: number,
    version: number,
  ): GroupChat {
    return new GroupChat(id, deleted, name, members, sequenceNumber, version);
  }

  addMember(
    userAccountId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ): E.Either<GroupChatAddMemberError, [GroupChat, GroupChatMemberAdded]> {
    if (this.deleted) {
      return E.left(GroupChatAddMemberError.of("The group chat is deleted"));
    }
    if (this.members.isMember(userAccountId)) {
      return E.left(
        GroupChatAddMemberError.of(
          "The userAccountId is already the member of the group chat",
        ),
      );
    }
    if (!this.members.isAdministrator(executorId)) {
      return E.left(
        GroupChatAddMemberError.of(
          "The executorId is not the member of the group chat",
        ),
      );
    }
    const newMember = Member.of(userAccountId, memberRole);
    const newMembers = this.members.addMember(newMember);
    const sequenceNumber = this.sequenceNumber + 1;
    const newGroupChat = GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      newMembers,
      sequenceNumber,
      this.version,
    );
    const event = GroupChatMemberAdded.of(
      this.id,
      newMember,
      executorId,
      sequenceNumber,
    );
    return E.right([newGroupChat, event]);
  }

  delete(
    executorId: UserAccountId,
  ): E.Either<GroupChatDeleteError, [GroupChat, GroupChatDeleted]> {
    if (this.deleted) {
      return E.left(GroupChatDeleteError.of("The group chat is deleted"));
    }
    if (!this.members.isAdministrator(executorId)) {
      return E.left(
        GroupChatDeleteError.of(
          "The executorId is not the member of the group chat",
        ),
      );
    }
    const sequenceNumber = this.sequenceNumber + 1;
    const newGroupChat = GroupChat.from(
      this.id,
      true,
      this.name,
      this.members,
      sequenceNumber,
      this.version,
    );
    const event = GroupChatDeleted.of(this.id, executorId, sequenceNumber);
    return E.right([newGroupChat, event]);
  }

  withVersion(version: number): GroupChat {
    return GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      this.members,
      this.sequenceNumber,
      version,
    );
  }

  updateVersion(version: (value: number) => number): GroupChat {
    return GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      this.members,
      this.sequenceNumber,
      version(this.version),
    );
  }

  equals(other: GroupChat): boolean {
    return (
      this.id.equals(other.id) &&
      this.deleted === other.deleted &&
      this.name.equals(other.name) &&
      this.members.equals(other.members) &&
      this.sequenceNumber === other.sequenceNumber &&
      this.version === other.version
    );
  }
}

export {
  GroupChat,
  GroupChatError,
  GroupChatAddMemberError,
  GroupChatDeleteError,
};
