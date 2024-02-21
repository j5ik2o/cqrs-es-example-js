import {
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

interface GroupChatDao {
  insertGroupChat: (
    aggregateId: GroupChatId,
    name: GroupChatName,
    administratorId: UserAccountId,
    createdAt: Date,
  ) => void;
}

const GroupChatDao = {};

export { GroupChatDao };
