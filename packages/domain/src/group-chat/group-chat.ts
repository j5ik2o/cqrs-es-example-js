import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {
  GroupChatCreated,
  GroupChatDeleted,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessagePosted,
} from "./group-chat-events";
import { UserAccountId } from "../user-account";
import { Member, MemberRole } from "./member";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  GroupChatAddMemberError,
  GroupChatDeleteError,
  GroupChatPostError,
  GroupChatRemoveMemberError,
} from "./group-chat-errors";
import { Message } from "./message";
import { Messages } from "./messages";

const GroupChatSymbol = Symbol("GroupChat");

type GroupChat = Readonly<{
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
  ) => E.Either<GroupChatPostError, [GroupChat, GroupChatMessagePosted]>;
  delete: (
    executorId: UserAccountId,
  ) => E.Either<GroupChatDeleteError, [GroupChat, GroupChatDeleted]>;
  withVersion: (version: number) => GroupChat;
  updateVersion: (version: (value: number) => number) => GroupChat;
  equals: (other: GroupChat) => boolean;
}>;

function newGroupChat(
  id: GroupChatId,
  deleted: boolean,
  name: GroupChatName,
  members: Members,
  messages: Messages,
  sequenceNumber: number,
  version: number,
): GroupChat {
  return {
    symbol: GroupChatSymbol,
    id,
    deleted,
    name,
    members,
    messages,
    sequenceNumber,
    version,
    addMember(
      userAccountId: UserAccountId,
      memberRole: MemberRole,
      executorId: UserAccountId,
    ) {
      if (deleted) {
        return E.left(GroupChatAddMemberError.of("The group chat is deleted"));
      }
      if (members.isMember(userAccountId)) {
        return E.left(
          GroupChatAddMemberError.of(
            "The userAccountId is already the member of the group chat",
          ),
        );
      }
      if (!members.isAdministrator(executorId)) {
        return E.left(
          GroupChatAddMemberError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const newMember = Member.of(userAccountId, memberRole);
      const newMembers = members.addMember(newMember);
      const newSequenceNumber = sequenceNumber + 1;
      const groupChatUpdated: GroupChat = {
        ...this,
        members: newMembers,
        sequenceNumber: newSequenceNumber,
      };
      const event = GroupChatMemberAdded.of(
        id,
        newMember,
        executorId,
        newSequenceNumber,
      );
      return E.right([groupChatUpdated, event]);
    },
    removeMemberById(userAccountId: UserAccountId, executorId: UserAccountId) {
      if (deleted) {
        return E.left(
          GroupChatRemoveMemberError.of("The group chat is deleted"),
        );
      }
      if (!members.containsById(userAccountId)) {
        return E.left(
          GroupChatRemoveMemberError.of(
            "The userAccountId is not the member of the group chat",
          ),
        );
      }
      const newMembersOpt = members.removeMemberById(userAccountId);
      if (O.isNone(newMembersOpt)) {
        return E.left(
          GroupChatRemoveMemberError.of(
            "The userAccountId is not the member of the group chat",
          ),
        );
      }
      const [newMembers, removedMember] = newMembersOpt.value;
      const newSequenceNumber = sequenceNumber + 1;
      const groupChatUpdated: GroupChat = {
        ...this,
        members: newMembers,
        sequenceNumber: newSequenceNumber,
      };
      const event = GroupChatMemberRemoved.of(
        id,
        removedMember,
        executorId,
        newSequenceNumber,
      );
      return E.right([groupChatUpdated, event]);
    },
    postMessage(message: Message, executorId: UserAccountId) {
      if (deleted) {
        return E.left(GroupChatPostError.of("The group chat is deleted"));
      }
      if (!members.containsById(executorId)) {
        return E.left(
          GroupChatPostError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      if (!members.containsById(message.senderId)) {
        return E.left(
          GroupChatPostError.of(
            "The sender id is not the member of the group chat",
          ),
        );
      }
      if (messages.containsById(message.id)) {
        return E.left(
          GroupChatPostError.of(
            "The message id is already exists in the group chat",
          ),
        );
      }
      const newSequenceNumber = sequenceNumber + 1;
      const newMessages = messages.addMessage(message);
      const groupChatUpdated: GroupChat = {
        ...this,
        messages: newMessages,
        sequenceNumber: newSequenceNumber,
      };
      const event = GroupChatMessagePosted.of(
        id,
        message,
        executorId,
        newSequenceNumber,
      );
      return E.right([groupChatUpdated, event]);
    },
    delete(
      executorId: UserAccountId,
    ): E.Either<GroupChatDeleteError, [GroupChat, GroupChatDeleted]> {
      if (deleted) {
        return E.left(GroupChatDeleteError.of("The group chat is deleted"));
      }
      if (!members.isAdministrator(executorId)) {
        return E.left(
          GroupChatDeleteError.of(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const newSequenceNumber = sequenceNumber + 1;
      const groupChatUpdated: GroupChat = {
        ...this,
        deleted: true,
        sequenceNumber: newSequenceNumber,
      };
      const event = GroupChatDeleted.of(id, executorId, newSequenceNumber);
      return E.right([groupChatUpdated, event]);
    },
    withVersion(version: number): GroupChat {
      return { ...this, version };
    },
    updateVersion(versionF: (value: number) => number): GroupChat {
      return { ...this, version: versionF(version) };
    },
    equals: (other: GroupChat) => {
      return (
        id.equals(other.id) &&
        deleted === other.deleted &&
        name.equals(other.name) &&
        members.equals(other.members) &&
        sequenceNumber === other.sequenceNumber &&
        version === other.version
      );
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
      newGroupChat(
        id,
        false,
        name,
        members,
        Messages.ofEmpty(),
        sequenceNumber,
        version,
      ),
      GroupChatCreated.of(id, name, members, executorId, sequenceNumber),
    ];
  },
};

export { GroupChat };
