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

class GroupChatDao {
  private constructor(private readonly prismaClient: PrismaClient) {}

  async insertGroupChat(
    aggregateId: GroupChatId,
    name: GroupChatName,
    administratorId: UserAccountId,
    createdAt: Date,
  ) {
    return await this.prismaClient.$transaction(async (_prismaClient) => {
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
  }

  async deleteGroupChat(aggregateId: GroupChatId, createdAt: Date) {
    return await this.prismaClient.groupChats.update({
      where: { id: aggregateId.asString() },
      data: { disabled: true, updatedAt: createdAt },
    });
  }

  async updateGroupChatName(
    aggregateId: GroupChatId,
    name: GroupChatName,
    updatedAt: Date,
  ) {
    return await this.prismaClient.groupChats.update({
      where: { id: aggregateId.asString() },
      data: { name: name.asString(), updatedAt: updatedAt },
    });
  }

  async insertGroupChatMember(
    id: MemberId,
    aggregateId: GroupChatId,
    userAccountId: UserAccountId,
    role: MemberRole,
    createdAt: Date,
  ) {
    return await this.prismaClient.members.create({
      data: {
        id: id.asString(),
        groupChatId: aggregateId.asString(),
        userAccountId: userAccountId.asString(),
        role: role.toString(),
        createdAt: createdAt,
        updatedAt: createdAt,
      },
    });
  }

  async deleteMember(aggregateId: GroupChatId, userAccountId: UserAccountId) {
    return await this.prismaClient.members.delete({
      where: {
        groupChatId_userAccountId: {
          groupChatId: aggregateId.asString(),
          userAccountId: userAccountId.asString(),
        },
      },
    });
  }

  async insertMessage(
    aggregateId: GroupChatId,
    message: Message,
    createdAt: Date,
  ) {
    return await this.prismaClient.messages.create({
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
  }

  async deleteMessage(id: MessageId, updatedAt: Date) {
    return await this.prismaClient.messages.update({
      where: { id: id.asString() },
      data: { disabled: true, updatedAt: updatedAt },
    });
  }

  static of(prismaClient: PrismaClient) {
    return new GroupChatDao(prismaClient);
  }
}

export { GroupChatDao };
