import { Aggregate } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {
  GroupChatCreated,
  GroupChatDeleted,
  GroupChatMemberAdded,
  GroupChatMemberRemoved, GroupChatMessagePosted,
} from "./group-chat-events";
import { UserAccountId } from "../user-account";
import { Member, MemberRole } from "./member";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  GroupChatAddMemberError,
  GroupChatDeleteError, GroupChatPostError,
  GroupChatRemoveMemberError,
} from "./group-chat-errors";
import {Message} from "./message";
import {Messages} from "./messages";

const GroupChatSymbol = Symbol("GroupChat");

class GroupChat implements Aggregate<GroupChat, GroupChatId> {
  readonly symbol: typeof GroupChatSymbol = GroupChatSymbol;

  private constructor(
    public readonly id: GroupChatId,
    private readonly deleted: boolean,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly messages: Messages,
    public readonly sequenceNumber: number,
    public readonly version: number,
  ) {}

  static create(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): [GroupChat, GroupChatCreated] {
    const members = Members.ofSingle(executorId);
    const sequenceNumber = 1;
    const version = 1;
    return [
      new GroupChat(id, false, name, members, Messages.ofEmpty(), sequenceNumber, version),
      GroupChatCreated.of(id, name, members, executorId, sequenceNumber),
    ];
  }

  private static from(
    id: GroupChatId,
    deleted: boolean,
    name: GroupChatName,
    members: Members,
    messages: Messages,
    sequenceNumber: number,
    version: number,
  ): GroupChat {
    return new GroupChat(id, deleted, name, members, messages, sequenceNumber, version);
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
      this.messages,
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

  removeMemberById(
    userAccountId: UserAccountId,
    executorId: UserAccountId,
  ): E.Either<GroupChatRemoveMemberError, [GroupChat, GroupChatMemberRemoved]> {
    if (this.deleted) {
      return E.left(GroupChatRemoveMemberError.of("The group chat is deleted"));
    }
    if (!this.members.containsById(userAccountId)) {
      return E.left(
        GroupChatRemoveMemberError.of(
          "The userAccountId is not the member of the group chat",
        ),
      );
    }
    const newMembersOpt = this.members.removeMemberById(userAccountId);
    if (O.isNone(newMembersOpt)) {
      return E.left(
        GroupChatRemoveMemberError.of(
          "The userAccountId is not the member of the group chat",
        ),
      );
    }
    const [newMembers, removedMember] = newMembersOpt.value;
    const sequenceNumber = this.sequenceNumber + 1;
    const newGroupChat = GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      newMembers,
      this.messages,
      sequenceNumber,
      this.version,
    );
    const event = GroupChatMemberRemoved.of(
      this.id,
      removedMember,
      executorId,
      sequenceNumber,
    );
    return E.right([newGroupChat, event]);
  }

  postMessage(message: Message, executorId: UserAccountId): E.Either<GroupChatPostError, [GroupChat, GroupChatMessagePosted]> {
    if (this.deleted) {
      return E.left(GroupChatPostError.of("The group chat is deleted"));
    }
    if (!this.members.containsById(executorId)) {
      return E.left(
        GroupChatPostError.of(
          "The executorId is not the member of the group chat",
        ),
      );
    }
    if (!this.members.containsById(message.senderId)) {
        return E.left(
            GroupChatPostError.of(
            "The sender id is not the member of the group chat",
            ),
        );
    }
    if (this.messages.containsById(message.id)) {
        return E.left(
            GroupChatPostError.of(
            "The message id is already exists in the group chat",
            ),
        );
    }
    const sequenceNumber = this.sequenceNumber + 1;
    const newMessages = this.messages.addMessage(message);
    const newGroupChat = GroupChat.from(
        this.id,
        this.deleted,
        this.name,
        this.members,
        newMessages,
        sequenceNumber,
        this.version,
    );
    const event = GroupChatMessagePosted.of(this.id, message, executorId, sequenceNumber);
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
      this.messages,
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
      this.messages,
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
      this.messages,
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

export { GroupChat };
