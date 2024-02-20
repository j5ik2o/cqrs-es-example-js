import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
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
  };
}

const GroupChatCommandProcessor = {
  of(groupChatRepository: GroupChatRepository): GroupChatCommandProcessor {
    return initialize(groupChatRepository);
  },
};

export { GroupChatCommandProcessor };
