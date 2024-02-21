import { convertJSONToGroupChatId, GroupChatId } from "./group-chat-id";
import { convertJSONToGroupChatName, GroupChatName } from "./group-chat-name";
import { convertJSONToMembers, Members } from "./members";
import {
  GroupChatCreated,
  GroupChatDeleted,
  GroupChatDeletedTypeSymbol,
  GroupChatEvent,
  GroupChatMemberAdded,
  GroupChatMemberAddedTypeSymbol,
  GroupChatMemberRemoved,
  GroupChatMemberRemovedTypeSymbol,
  GroupChatMessageDeleted,
  GroupChatMessageDeletedTypeSymbol,
  GroupChatMessagePosted,
  GroupChatMessagePostedTypeSymbol,
  GroupChatRenamed,
  GroupChatRenamedTypeSymbol,
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
  GroupChatRenameError,
} from "./group-chat-errors";
import { Message } from "./message";
import { convertJSONToMessages, Messages } from "./messages";
import { MessageId } from "./message-id";
import { Aggregate } from "event-store-adapter-js";
import { MemberId } from "./member-id";

const GroupChatTypeSymbol = Symbol("GroupChat");

interface GroupChat extends Aggregate<GroupChat, GroupChatId> {
  symbol: typeof GroupChatTypeSymbol;
  typeName: string;
  id: GroupChatId;
  deleted: boolean;
  name: GroupChatName;
  members: Members;
  messages: Messages;
  sequenceNumber: number;
  version: number;
  rename: (
    name: GroupChatName,
    executorId: UserAccountId,
  ) => E.Either<GroupChatRenameError, [GroupChat, GroupChatRenamed]>;
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
  applyEvent: (event: GroupChatEvent) => GroupChat;
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
    symbol: GroupChatTypeSymbol,
    typeName: "GroupChat",
    id: params.id,
    deleted: params.deleted,
    name: params.name,
    members: params.members,
    messages: params.messages,
    sequenceNumber: params.sequenceNumber,
    version: params.version,
    rename(name: GroupChatName, executorId: UserAccountId) {
      if (this.deleted) {
        return E.left(GroupChatRenameError.of("The group chat is deleted"));
      }
      if (!this.members.isAdministrator(executorId)) {
        return E.left(
          GroupChatRenameError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      if (this.name.equals(name)) {
        return E.left(
          GroupChatRenameError.of("The new name is the same as the old name"),
        );
      }
      const newSequenceNumber = this.sequenceNumber + 1;
      const newGroupChat: GroupChat = initialize({
        ...this,
        name,
        sequenceNumber: newSequenceNumber,
      });
      const event = GroupChatRenamed.of(
        this.id,
        name,
        executorId,
        newSequenceNumber,
      );
      return E.right([newGroupChat, event]);
    },
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
      const newMember = Member.of(
        MemberId.generate(),
        userAccountId,
        memberRole,
      );
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
      return initialize({ ...this, version });
    },
    updateVersion(versionF: (value: number) => number): GroupChat {
      return initialize({ ...this, version: versionF(this.version) });
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
    applyEvent(event: GroupChatEvent): GroupChat {
      switch (event.symbol) {
        case GroupChatRenamedTypeSymbol: {
          const typedEvent = event as GroupChatRenamed;
          const result = this.rename(typedEvent.name, event.executorId);
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        case GroupChatMemberAddedTypeSymbol: {
          const typedEvent = event as GroupChatMemberAdded;
          const result = this.addMember(
            typedEvent.member.userAccountId,
            typedEvent.member.memberRole,
            event.executorId,
          );
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        case GroupChatMemberRemovedTypeSymbol: {
          const typedEvent = event as GroupChatMemberRemoved;
          const result = this.removeMemberById(
            typedEvent.member.userAccountId,
            event.executorId,
          );
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        case GroupChatMessagePostedTypeSymbol: {
          const typedEvent = event as GroupChatMessagePosted;
          const result = this.postMessage(typedEvent.message, event.executorId);
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        case GroupChatMessageDeletedTypeSymbol: {
          const typedEvent = event as GroupChatMessageDeleted;
          const result = this.deleteMessage(
            typedEvent.message.id,
            event.executorId,
          );
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        case GroupChatDeletedTypeSymbol: {
          const typedEvent = event as GroupChatDeleted;
          const result = this.delete(typedEvent.executorId);
          if (E.isLeft(result)) {
            throw new Error(result.left.message);
          }
          return result.right[0];
        }
        default: {
          throw new Error("Unknown event");
        }
      }
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
  replay(events: GroupChatEvent[], snapshot: GroupChat): GroupChat {
    return events.reduce(
      (groupChat, event) => groupChat.applyEvent(event),
      snapshot,
    );
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToGroupChat(json: any): GroupChat {
  // console.log("convertJSONToGroupChat = ", obj);
  const id = convertJSONToGroupChatId(json.data.id);
  const name = convertJSONToGroupChatName(json.data.name);
  const members = convertJSONToMembers(json.data.members);
  const messages = convertJSONToMessages(json.data.messages);
  return initialize({
    id,
    deleted: false,
    name,
    members,
    messages,
    sequenceNumber: json.data.sequenceNumber,
    version: json.data.version,
  });
}

export { GroupChat, GroupChatTypeSymbol, convertJSONToGroupChat };
