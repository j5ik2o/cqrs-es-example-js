import {
  GroupChatId,
  GroupChatName,
  MemberId,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { PrismaClient } from "@prisma/client";
interface GroupChatDao {
  insertGroupChat: (
    aggregateId: GroupChatId,
    name: GroupChatName,
    administratorId: UserAccountId,
    createdAt: Date,
  ) => void;
  deleteGroupChat: (aggregateId: GroupChatId, createdAt: Date) => void;
  updateGroupChatName(
    aggregateId: GroupChatId,
    name: GroupChatName,
    updatedAt: Date,
  ): void;
  insertGroupChatMember: (
    id: MemberId,
    aggregateId: GroupChatId,
    userAccountId: UserAccountId,
    role: MemberRole,
    createdAt: Date,
  ) => void;
  deleteMember: (
    aggregateId: GroupChatId,
    userAccountId: UserAccountId,
  ) => void;
  insertMessage: (
    aggregateId: GroupChatId,
    message: Message,
    createdAt: Date,
  ) => void;
  deleteMessage: (id: MessageId, updatedAt: Date) => void;
}

const GroupChatDao = {
  of(prismaClient: PrismaClient): GroupChatDao {
    return {
      insertGroupChat: async (
        aggregateId: GroupChatId,
        name: GroupChatName,
        administratorId: UserAccountId,
        createdAt: Date,
      ) => {
        await prismaClient.group_chats.create({
          data: {
            id: aggregateId.asString(),
            disabled: false,
            name: name.asString(),
            owner_id: administratorId.asString(),
            created_at: createdAt,
            updated_at: createdAt,
          },
        });
      },
      deleteGroupChat: async (aggregateId: GroupChatId, createdAt: Date) => {
        await prismaClient.group_chats.update({
          where: { id: aggregateId.asString() },
          data: { disabled: true, updated_at: createdAt },
        });
      },
      updateGroupChatName: async (
        aggregateId: GroupChatId,
        name: GroupChatName,
        updatedAt: Date,
      ) => {
        await prismaClient.group_chats.update({
          where: { id: aggregateId.asString() },
          data: { name: name.asString(), updated_at: updatedAt },
        });
      },
      insertGroupChatMember: async (
        id: MemberId,
        aggregateId: GroupChatId,
        userAccountId: UserAccountId,
        role: MemberRole,
        createdAt: Date,
      ) => {
        await prismaClient.members.create({
          data: {
            id: id.asString(),
            group_chat_id: aggregateId.asString(),
            user_account_id: userAccountId.asString(),
            role: role.toString(),
            created_at: createdAt,
            updated_at: createdAt,
          },
        });
      },
      deleteMember: async (
        aggregateId: GroupChatId,
        userAccountId: UserAccountId,
      ) => {
        await prismaClient.members.delete({
          where: {
            group_chat_id_user_account_id: {
              group_chat_id: aggregateId.asString(),
              user_account_id: userAccountId.asString(),
            },
          },
        });
      },
      insertMessage: async (
        aggregateId: GroupChatId,
        message: Message,
        createdAt: Date,
      ) => {
        await prismaClient.messages.create({
          data: {
            id: message.id.asString(),
            disabled: false,
            group_chat_id: aggregateId.asString(),
            text: message.content,
            user_account_id: message.senderId.asString(),
            created_at: createdAt,
            updated_at: createdAt,
          },
        });
      },
      deleteMessage: async (id: MessageId, updatedAt: Date) => {
        await prismaClient.messages.update({
          where: { id: id.asString() },
          data: { disabled: true, updated_at: updatedAt },
        });
      },
    };
  },
};

export { GroupChatDao };
