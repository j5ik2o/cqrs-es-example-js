import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { GroupChatRepository } from "cqrs-es-example-js-command-interface-adaptor-if";
import * as E from "fp-ts/lib/Either";

interface GroupChatCommandProcessor {
  createGroupChat: (
    name: GroupChatName,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  deleteGroupChat: (
    id: GroupChatId,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  renameGroupChat: (
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  addMember: (
    id: GroupChatId,
    memberId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  removeMember: (
    id: GroupChatId,
    memberId: UserAccountId,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  postMessage: (
    id: GroupChatId,
    message: Message,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  deleteMessage: (
    id: GroupChatId,
    messageId: MessageId,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
}

function initialize(
  groupChatRepository: GroupChatRepository,
): GroupChatCommandProcessor {
  return {
    createGroupChat: async (name: GroupChatName, executorId: UserAccountId) => {
      const id = GroupChatId.generate();
      const [groupChat, groupChatCreated] = GroupChat.create(
        id,
        name,
        executorId,
      );
      await groupChatRepository.storeEventAndSnapshot(
        groupChatCreated,
        groupChat,
      );
      return groupChatCreated;
    },
    deleteGroupChat: async (id: GroupChatId, executorId: UserAccountId) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const deleteEither = groupChat.delete(executorId);
      if (E.isLeft(deleteEither)) {
        throw new Error(deleteEither.left.message);
      }
      const [, groupChatDeleted] = deleteEither.right;
      await groupChatRepository.storeEvent(groupChatDeleted, groupChat.version);
      return groupChatDeleted;
    },
    renameGroupChat: async (
      id: GroupChatId,
      name: GroupChatName,
      executorId: UserAccountId,
    ) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const renameEither = groupChat.rename(name, executorId);
      if (E.isLeft(renameEither)) {
        throw new Error(renameEither.left.message);
      }
      const [, groupChatRenamed] = renameEither.right;
      await groupChatRepository.storeEvent(groupChatRenamed, groupChat.version);
      return groupChatRenamed;
    },
    addMember: async (
      id: GroupChatId,
      memberId: UserAccountId,
      memberRole: MemberRole,
      executorId: UserAccountId,
    ) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const addMemberEither = groupChat.addMember(
        memberId,
        memberRole,
        executorId,
      );
      if (E.isLeft(addMemberEither)) {
        throw new Error(addMemberEither.left.message);
      }
      const [, groupChatMemberAdded] = addMemberEither.right;
      await groupChatRepository.storeEvent(
        groupChatMemberAdded,
        groupChat.version,
      );
      return groupChatMemberAdded;
    },
    removeMember: async (
      id: GroupChatId,
      memberId: UserAccountId,
      executorId: UserAccountId,
    ) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const removeMemberEither = groupChat.removeMemberById(
        memberId,
        executorId,
      );
      if (E.isLeft(removeMemberEither)) {
        throw new Error(removeMemberEither.left.message);
      }
      const [, groupChatMemberRemoved] = removeMemberEither.right;
      await groupChatRepository.storeEvent(
        groupChatMemberRemoved,
        groupChat.version,
      );
      return groupChatMemberRemoved;
    },
    postMessage: async (
      id: GroupChatId,
      message: Message,
      executorId: UserAccountId,
    ) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const postMessageEither = groupChat.postMessage(message, executorId);
      if (E.isLeft(postMessageEither)) {
        throw new Error(postMessageEither.left.message);
      }
      const [, groupChatMessagePosted] = postMessageEither.right;
      await groupChatRepository.storeEvent(
        groupChatMessagePosted,
        groupChat.version,
      );
      return groupChatMessagePosted;
    },
    deleteMessage: async (
      id: GroupChatId,
      messageId: MessageId,
      executorId: UserAccountId,
    ) => {
      const groupChat = await groupChatRepository.findById(id);
      if (groupChat === undefined) {
        throw new Error("Group chat not found");
      }
      const deleteMessageEither = groupChat.deleteMessage(
        messageId,
        executorId,
      );
      if (E.isLeft(deleteMessageEither)) {
        throw new Error(deleteMessageEither.left.message);
      }
      const [, groupChatMessageDeleted] = deleteMessageEither.right;
      await groupChatRepository.storeEvent(
        groupChatMessageDeleted,
        groupChat.version,
      );
      return groupChatMessageDeleted;
    },
  };
}

const GroupChatCommandProcessor = {
  of(groupChatRepository: GroupChatRepository): GroupChatCommandProcessor {
    return initialize(groupChatRepository);
  },
};

export { GroupChatCommandProcessor };
