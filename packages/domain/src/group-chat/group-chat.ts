import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {
  GroupChatCreated,
  GroupChatDeleted,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessageDeleted,
  GroupChatMessagePosted,
} from "./group-chat-events";
import { UserAccountId } from "../user-account";
import { Member, MemberRole } from "./member";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  GroupChatAddMemberError,
  GroupChatDeleteError,
  GroupChatDeleteMessageError,
  GroupChatPostMessageError,
  GroupChatRemoveMemberError,
} from "./group-chat-errors";
import { Message } from "./message";
import { Messages } from "./messages";
import { MessageId } from "./message-id";

const GroupChatSymbol = Symbol("GroupChat");

interface GroupChat {
  symbol: typeof GroupChatSymbol;
  id: GroupChatId;
  deleted: boolean;
  name: GroupChatName;
  members: Members;
  messages: Messages;
  sequenceNumber: number;
  version: number;
  addMember: (
    userAccountId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ) => E.Either<GroupChatAddMemberError, [GroupChat, GroupChatMemberAdded]>;
  removeMemberById: (
    userAccountId: UserAccountId,
    executorId: UserAccountId,
  ) => E.Either<
    GroupChatRemoveMemberError,
    [GroupChat, GroupChatMemberRemoved]
  >;
  postMessage: (
    message: Message,
    executorId: UserAccountId,
  ) => E.Either<GroupChatPostMessageError, [GroupChat, GroupChatMessagePosted]>;
  deleteMessage: (
    messageId: MessageId,
    executorId: UserAccountId,
  ) => E.Either<
    GroupChatDeleteMessageError,
    [GroupChat, GroupChatMessageDeleted]
  >;
  delete: (
    executorId: UserAccountId,
  ) => E.Either<GroupChatDeleteError, [GroupChat, GroupChatDeleted]>;
  withVersion: (version: number) => GroupChat;
  updateVersion: (version: (value: number) => number) => GroupChat;
  equals: (other: GroupChat) => boolean;
  toString: () => string;
}

interface GroupChatParams {
  id: GroupChatId;
  deleted: boolean;
  name: GroupChatName;
  members: Members;
  messages: Messages;
  sequenceNumber: number;
  version: number;
}

function initialize(params: GroupChatParams): GroupChat {
  return {
    symbol: GroupChatSymbol,
    id: params.id,
    deleted: params.deleted,
    name: params.name,
    members: params.members,
    messages: params.messages,
    sequenceNumber: params.sequenceNumber,
    version: params.version,
    addMember(
      userAccountId: UserAccountId,
      memberRole: MemberRole,
      executorId: UserAccountId,
    ) {
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
      const newSequenceNumber = this.sequenceNumber + 1;
      const newGroupChat: GroupChat = initialize({
        ...this,
        members: newMembers,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatMemberAdded.of(
        this.id,
        newMember,
        executorId,
        newSequenceNumber,
      );
      return E.right([newGroupChat, event]);
    },
    removeMemberById(userAccountId: UserAccountId, executorId: UserAccountId) {
      if (this.deleted) {
        return E.left(
          GroupChatRemoveMemberError.of("The group chat is deleted"),
        );
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
      const newSequenceNumber = this.sequenceNumber + 1;
      const newGroupChat: GroupChat = initialize({
        ...this,
        members: newMembers,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatMemberRemoved.of(
        this.id,
        removedMember,
        executorId,
        newSequenceNumber,
      );
      return E.right([newGroupChat, event]);
    },
    postMessage(message: Message, executorId: UserAccountId) {
      if (this.deleted) {
        return E.left(
          GroupChatPostMessageError.of("The group chat is deleted"),
        );
      }
      if (!this.members.containsById(executorId)) {
        return E.left(
          GroupChatPostMessageError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      if (!this.members.containsById(message.senderId)) {
        return E.left(
          GroupChatPostMessageError.of(
            "The sender id is not the member of the group chat",
          ),
        );
      }
      if (this.messages.containsById(message.id)) {
        return E.left(
          GroupChatPostMessageError.of(
            "The message id is already exists in the group chat",
          ),
        );
      }
      const newSequenceNumber = this.sequenceNumber + 1;
      const newMessages = this.messages.addMessage(message);
      const newGroupChat: GroupChat = initialize({
        ...this,
        messages: newMessages,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatMessagePosted.of(
        this.id,
        message,
        executorId,
        newSequenceNumber,
      );
      return E.right([newGroupChat, event]);
    },
    deleteMessage(messageId: MessageId, executorId: UserAccountId) {
      if (this.deleted) {
        return E.left(
          GroupChatDeleteMessageError.of("The group chat is deleted"),
        );
      }
      if (!this.members.containsById(executorId)) {
        return E.left(
          GroupChatDeleteMessageError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const result = this.messages.removeMessageById(messageId);
      if (O.isNone(result)) {
        return E.left(
          GroupChatDeleteMessageError.of(
            "The message id is not exists in the group chat",
          ),
        );
      }
      const [newMessages, removedMessage] = result.value;
      const newSequenceNumber = this.sequenceNumber + 1;
      const newGroupChat: GroupChat = initialize({
        ...this,
        messages: newMessages,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatMessageDeleted.of(
        this.id,
        removedMessage,
        executorId,
        newSequenceNumber,
      );
      return E.right([newGroupChat, event]);
    },
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
      const newSequenceNumber = this.sequenceNumber + 1;
      const newGroupChat: GroupChat = initialize({
        ...this,
        deleted: true,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatDeleted.of(this.id, executorId, newSequenceNumber);
      return E.right([newGroupChat, event]);
    },
    withVersion(version: number): GroupChat {
      return { ...this, version };
    },
    updateVersion(versionF: (value: number) => number): GroupChat {
      return { ...this, version: versionF(this.version) };
    },
    equals(other: GroupChat) {
      return (
        this.id.equals(other.id) &&
        this.deleted === other.deleted &&
        this.name.equals(other.name) &&
        this.members.equals(other.members) &&
        this.sequenceNumber === other.sequenceNumber &&
        this.version === other.version
      );
    },
    toString(): string {
      return JSON.stringify(this);
    },
  };
}

const GroupChat = {
  create(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): [GroupChat, GroupChatCreated] {
    const members = Members.ofSingle(executorId);
    const sequenceNumber = 1;
    const version = 1;
    return [
      initialize({
        id,
        deleted: false,
        name,
        members,
        messages: Messages.ofEmpty(),
        sequenceNumber,
        version,
      }),
      GroupChatCreated.of(id, name, members, executorId, sequenceNumber),
    ];
  },
};

export { GroupChat };
