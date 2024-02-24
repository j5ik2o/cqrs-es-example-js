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
      async insertGroupChat(
        aggregateId: GroupChatId,
        name: GroupChatName,
        administratorId: UserAccountId,
        createdAt: Date,
      ) {
        return await prismaClient.$transaction(async (_prismaClient) => {
          await _prismaClient.groupChats.create({
            data: {
              id: aggregateId.asString(),
              disabled: false,
              name: name.asString(),
              ownerId: administratorId.asString(),
              createdAt: createdAt,
              updatedAt: createdAt,
            },
          });
          await _prismaClient.members.create({
            data: {
              id: MemberId.generate().asString(),
              groupChatId: aggregateId.asString(),
              userAccountId: administratorId.asString(),
              role: "administrator",
              createdAt: createdAt,
              updatedAt: createdAt,
            },
          });
        });
      },
      deleteGroupChat: async (aggregateId: GroupChatId, createdAt: Date) => {
        await prismaClient.groupChats.update({
          where: { id: aggregateId.asString() },
          data: { disabled: true, updatedAt: createdAt },
        });
      },
      updateGroupChatName: async (
        aggregateId: GroupChatId,
        name: GroupChatName,
        updatedAt: Date,
      ) => {
        await prismaClient.groupChats.update({
          where: { id: aggregateId.asString() },
          data: { name: name.asString(), updatedAt: updatedAt },
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
            groupChatId: aggregateId.asString(),
            userAccountId: userAccountId.asString(),
            role: role.toString(),
            createdAt: createdAt,
            updatedAt: createdAt,
          },
        });
      },
      deleteMember: async (
        aggregateId: GroupChatId,
        userAccountId: UserAccountId,
      ) => {
        await prismaClient.members.delete({
          where: {
            groupChatId_userAccountId: {
              groupChatId: aggregateId.asString(),
              userAccountId: userAccountId.asString(),
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
            groupChatId: aggregateId.asString(),
            text: message.content,
            userAccountId: message.senderId.asString(),
            createdAt: createdAt,
            updatedAt: createdAt,
          },
        });
      },
      deleteMessage: async (id: MessageId, updatedAt: Date) => {
        await prismaClient.messages.update({
          where: { id: id.asString() },
          data: { disabled: true, updatedAt: updatedAt },
        });
      },
    };
  },
};

export { GroupChatDao };
