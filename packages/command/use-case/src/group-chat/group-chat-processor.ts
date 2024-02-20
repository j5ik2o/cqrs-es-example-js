import {
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

interface GroupChatCommandProcessor {
  createGroupChat: (name: GroupChatName) => Promise<GroupChatEvent>;
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
    userAccountId: UserAccountId,
    role: MemberRole,
    executorId: UserAccountId,
  ) => Promise<GroupChatEvent>;
  removeMember: (
    id: GroupChatId,
    userAccountId: UserAccountId,
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

export { GroupChatCommandProcessor };
