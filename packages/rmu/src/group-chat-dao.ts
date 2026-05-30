import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  GroupChatId,
  GroupChatName,
  Member,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

/**
 * Read-model write side. All operations are idempotent so the projection
 * tolerates at-least-once / duplicate event delivery (Pub/Sub, stream retries).
 */
export type GroupChatDao = {
  insertGroupChat(
    aggregateId: GroupChatId,
    name: GroupChatName,
    administrator: Member,
    createdAt: Date,
  ): Promise<void>;
  deleteGroupChat(aggregateId: GroupChatId, updatedAt: Date): Promise<void>;
  updateGroupChatName(
    aggregateId: GroupChatId,
    name: GroupChatName,
    updatedAt: Date,
  ): Promise<void>;
  insertMember(
    aggregateId: GroupChatId,
    member: Member,
    createdAt: Date,
  ): Promise<void>;
  deleteMember(
    aggregateId: GroupChatId,
    userAccountId: UserAccountId,
  ): Promise<void>;
  insertMessage(
    aggregateId: GroupChatId,
    message: Message,
    createdAt: Date,
  ): Promise<void>;
  deleteMessage(messageId: MessageId, updatedAt: Date): Promise<void>;
};

export namespace GroupChatDao {
  export function create(prismaClient: PrismaClient): GroupChatDao {
    return Object.freeze({
      async insertGroupChat(
        aggregateId: GroupChatId,
        name: GroupChatName,
        administrator: Member,
        createdAt: Date,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.groupChats.upsert({
              where: { id: aggregateId.asString() },
              create: {
                id: aggregateId.asString(),
                disabled: false,
                name: name.asString(),
                ownerId: administrator.userAccountId.asString(),
                createdAt,
                updatedAt: createdAt,
              },
              update: {},
            });
            await tx.members.upsert({
              where: {
                groupChatId_userAccountId: {
                  groupChatId: aggregateId.asString(),
                  userAccountId: administrator.userAccountId.asString(),
                },
              },
              create: {
                id: administrator.id.asString(),
                groupChatId: aggregateId.asString(),
                userAccountId: administrator.userAccountId.asString(),
                role: administrator.memberRole,
                createdAt,
                updatedAt: createdAt,
              },
              update: {},
            });
          },
        );
      },

      async deleteGroupChat(
        aggregateId: GroupChatId,
        updatedAt: Date,
      ): Promise<void> {
        await prismaClient.groupChats.updateMany({
          where: { id: aggregateId.asString() },
          data: { disabled: true, updatedAt },
        });
      },

      async updateGroupChatName(
        aggregateId: GroupChatId,
        name: GroupChatName,
        updatedAt: Date,
      ): Promise<void> {
        await prismaClient.groupChats.updateMany({
          where: { id: aggregateId.asString() },
          data: { name: name.asString(), updatedAt },
        });
      },

      async insertMember(
        aggregateId: GroupChatId,
        member: Member,
        createdAt: Date,
      ): Promise<void> {
        await prismaClient.members.upsert({
          where: {
            groupChatId_userAccountId: {
              groupChatId: aggregateId.asString(),
              userAccountId: member.userAccountId.asString(),
            },
          },
          create: {
            id: member.id.asString(),
            groupChatId: aggregateId.asString(),
            userAccountId: member.userAccountId.asString(),
            role: member.memberRole,
            createdAt,
            updatedAt: createdAt,
          },
          update: { role: member.memberRole, updatedAt: createdAt },
        });
      },

      async deleteMember(
        aggregateId: GroupChatId,
        userAccountId: UserAccountId,
      ): Promise<void> {
        await prismaClient.members.deleteMany({
          where: {
            groupChatId: aggregateId.asString(),
            userAccountId: userAccountId.asString(),
          },
        });
      },

      async insertMessage(
        aggregateId: GroupChatId,
        message: Message,
        createdAt: Date,
      ): Promise<void> {
        await prismaClient.messages.upsert({
          where: { id: message.id.asString() },
          create: {
            id: message.id.asString(),
            disabled: false,
            groupChatId: aggregateId.asString(),
            text: message.content,
            userAccountId: message.senderId.asString(),
            createdAt,
            updatedAt: createdAt,
          },
          update: {},
        });
      },

      async deleteMessage(
        messageId: MessageId,
        updatedAt: Date,
      ): Promise<void> {
        await prismaClient.messages.updateMany({
          where: { id: messageId.asString() },
          data: { disabled: true, updatedAt },
        });
      },
    });
  }
}
