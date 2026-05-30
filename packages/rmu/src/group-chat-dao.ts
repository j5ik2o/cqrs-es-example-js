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
 * Read-model write side. Operations are idempotent and monotonic so the
 * projection tolerates duplicate and delayed provider deliveries.
 */
export type GroupChatDao = {
  insertGroupChat(
    aggregateId: GroupChatId,
    name: GroupChatName,
    administrator: Member,
    createdAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  deleteGroupChat(
    aggregateId: GroupChatId,
    updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  updateGroupChatName(
    aggregateId: GroupChatId,
    name: GroupChatName,
    updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  insertMember(
    aggregateId: GroupChatId,
    member: Member,
    createdAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  deleteMember(
    aggregateId: GroupChatId,
    userAccountId: UserAccountId,
    updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  insertMessage(
    aggregateId: GroupChatId,
    message: Message,
    createdAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
  deleteMessage(
    aggregateId: GroupChatId,
    messageId: MessageId,
    updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void>;
};

export namespace GroupChatDao {
  export function create(prismaClient: PrismaClient): GroupChatDao {
    return Object.freeze({
      async insertGroupChat(
        aggregateId: GroupChatId,
        name: GroupChatName,
        administrator: Member,
        createdAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        const groupChatId = aggregateId.asString();
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            const updated = await tx.groupChats.updateMany({
              where: { id: groupChatId },
              data: {
                disabled: false,
                name: name.asString(),
                ownerId: administrator.userAccountId.asString(),
                updatedAt: createdAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
            if (updated.count === 0) {
              await tx.groupChats
                .create({
                  data: {
                    id: groupChatId,
                    disabled: false,
                    name: name.asString(),
                    ownerId: administrator.userAccountId.asString(),
                    lastProcessedSequenceNumber: sequenceNumber,
                    createdAt,
                    updatedAt: createdAt,
                  },
                })
                .catch(ignoreUniqueConstraint);
            }
            await upsertMember(tx, {
              groupChatId,
              member: administrator,
              at: createdAt,
              sequenceNumber,
            });
          },
        );
      },

      async deleteGroupChat(
        aggregateId: GroupChatId,
        updatedAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            await tx.groupChats.updateMany({
              where: { id: groupChatId },
              data: {
                disabled: true,
                updatedAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
          },
        );
      },

      async updateGroupChatName(
        aggregateId: GroupChatId,
        name: GroupChatName,
        updatedAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            await tx.groupChats.updateMany({
              where: { id: groupChatId },
              data: {
                name: name.asString(),
                updatedAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
          },
        );
      },

      async insertMember(
        aggregateId: GroupChatId,
        member: Member,
        createdAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            await upsertMember(tx, {
              groupChatId,
              member,
              at: createdAt,
              sequenceNumber,
            });
          },
        );
      },

      async deleteMember(
        aggregateId: GroupChatId,
        userAccountId: UserAccountId,
        updatedAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            await tx.members.updateMany({
              where: {
                groupChatId,
                userAccountId: userAccountId.asString(),
              },
              data: {
                disabled: true,
                updatedAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
          },
        );
      },

      async insertMessage(
        aggregateId: GroupChatId,
        message: Message,
        createdAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            const updated = await tx.messages.updateMany({
              where: { id: message.id.asString() },
              data: {
                disabled: false,
                groupChatId,
                text: message.content,
                userAccountId: message.senderId.asString(),
                updatedAt: createdAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
            if (updated.count === 0) {
              await tx.messages
                .create({
                  data: {
                    id: message.id.asString(),
                    disabled: false,
                    groupChatId,
                    userAccountId: message.senderId.asString(),
                    text: message.content,
                    lastProcessedSequenceNumber: sequenceNumber,
                    createdAt,
                    updatedAt: createdAt,
                  },
                })
                .catch(ignoreUniqueConstraint);
            }
          },
        );
      },

      async deleteMessage(
        aggregateId: GroupChatId,
        messageId: MessageId,
        updatedAt: Date,
        sequenceNumber: number,
      ): Promise<void> {
        await prismaClient.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const groupChatId = aggregateId.asString();
            if (!(await advanceProjection(tx, groupChatId, sequenceNumber))) {
              return;
            }
            await tx.messages.updateMany({
              where: { id: messageId.asString() },
              data: {
                disabled: true,
                updatedAt,
                lastProcessedSequenceNumber: sequenceNumber,
              },
            });
          },
        );
      },
    });
  }
}

async function advanceProjection(
  prismaClient: PrismaClient | Prisma.TransactionClient,
  aggregateId: string,
  sequenceNumber: number,
): Promise<boolean> {
  const current = await prismaClient.readModelPositions.findUnique({
    where: { aggregateId },
  });
  if (current !== null) {
    if (sequenceNumber <= current.lastProcessedSequenceNumber) {
      return false;
    }
    const expected = current.lastProcessedSequenceNumber + 1;
    if (sequenceNumber !== expected) {
      throw new Error(
        `Read model projection gap for ${aggregateId}: expected sequence ${expected}, got ${sequenceNumber}`,
      );
    }
    const updated = await prismaClient.readModelPositions.updateMany({
      where: {
        aggregateId,
        lastProcessedSequenceNumber: current.lastProcessedSequenceNumber,
      },
      data: { lastProcessedSequenceNumber: sequenceNumber },
    });
    return updated.count > 0;
  }

  if (sequenceNumber !== 1) {
    throw new Error(
      `Read model projection gap for ${aggregateId}: expected sequence 1, got ${sequenceNumber}`,
    );
  }

  try {
    await prismaClient.readModelPositions.create({
      data: { aggregateId, lastProcessedSequenceNumber: sequenceNumber },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return false;
    }
    throw error;
  }
}

async function upsertMember(
  prismaClient: PrismaClient | Prisma.TransactionClient,
  input: {
    groupChatId: string;
    member: Member;
    at: Date;
    sequenceNumber: number;
  },
): Promise<void> {
  const updated = await prismaClient.members.updateMany({
    where: {
      groupChatId: input.groupChatId,
      userAccountId: input.member.userAccountId.asString(),
    },
    data: {
      id: input.member.id.asString(),
      role: input.member.memberRole,
      disabled: false,
      updatedAt: input.at,
      lastProcessedSequenceNumber: input.sequenceNumber,
    },
  });
  if (updated.count === 0) {
    await prismaClient.members
      .create({
        data: {
          id: input.member.id.asString(),
          groupChatId: input.groupChatId,
          userAccountId: input.member.userAccountId.asString(),
          role: input.member.memberRole,
          disabled: false,
          lastProcessedSequenceNumber: input.sequenceNumber,
          createdAt: input.at,
          updatedAt: input.at,
        },
      })
      .catch(ignoreUniqueConstraint);
  }
}

function ignoreUniqueConstraint(error: unknown): void {
  if (isUniqueConstraint(error)) {
    return;
  }
  throw error;
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
