import { PrismaClient } from "@prisma/client";
import { Arg, Ctx, Query, Resolver } from "type-graphql";
import { GroupChatOutput, MemberOutput, MessageOutput } from "./outputs";
import { ILogObj, Logger } from "tslog";

interface QueryContext {
  prisma: PrismaClient;
}

@Resolver()
class GroupChatQueryResolver {
  private readonly logger: Logger<ILogObj> = new Logger();
  @Query(() => GroupChatOutput)
  async getGroupChat(
    @Ctx() { prisma }: QueryContext,
    @Arg("groupChatId") groupChatId: string,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<GroupChatOutput> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupChats: any = await prisma.$queryRaw`
        SELECT gc.id as id, gc.name as name, gc.owner_id as ownerId, gc.created_at as createdAt, gc.updated_at as updatedAt
        FROM group_chats AS gc JOIN members AS m ON gc.id = m.group_chat_id 
        WHERE gc.disabled = 'false' AND m.group_chat_id = ${groupChatId} AND m.user_account_id = ${userAccountId}`;
    this.logger.debug("getGroupChats:", groupChats);
    if (!groupChats.length) {
      throw new Error("not found");
    }
    const groupChat = groupChats[0];
    return {
      id: groupChat.id,
      name: groupChat.name,
      ownerId: groupChat.ownerId,
      createdAt: groupChat.createdAt,
      updatedAt: groupChat.updatedAt,
    };
  }
  @Query(() => [GroupChatOutput])
  async getGroupChats(
    @Ctx() { prisma }: QueryContext,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<GroupChatOutput[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupChats: any = await prisma.$queryRaw`
        SELECT gc.id as id, gc.name as name, gc.owner_id as ownerId, gc.created_at as createdAt, gc.updated_at as updatedAt
	    FROM group_chats AS gc JOIN members AS m ON gc.id = m.group_chat_id
        WHERE gc.disabled = 'false' AND m.user_account_id = ${userAccountId}`;
    this.logger.debug("getGroupChats:", groupChats);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return groupChats.map((groupChat: any) => {
      return {
        id: groupChat.id,
        name: groupChat.name,
        ownerId: groupChat.ownerId,
        createdAt: groupChat.createdAt,
        updatedAt: groupChat.updatedAt,
      };
    });
  }
  @Query(() => MemberOutput)
  async getMember(
    @Ctx() { prisma }: QueryContext,
    @Arg("groupChatId") groupChatId: string,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<MemberOutput> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: any = await prisma.$queryRaw`
        SELECT m.id as id, m.group_chat_id as groupChatId, m.user_account_id as userAccountId, m.role as role, m.created_at as createdAt, m.updated_at as updatedAt
	    FROM group_chats AS gc JOIN members AS m ON gc.id = m.group_chat_id
	    WHERE gc.disabled = 'false' AND m.group_chat_id = ${groupChatId} AND m.user_account_id = ${userAccountId}`;
    if (!members.length) {
      throw new Error("not found");
    }
    const member = members[0];
    this.logger.debug("member:", member);
    return {
      id: member.id,
      groupChatId: member.groupChatId,
      userAccountId: member.userAccountId,
      role: member.role,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }

  @Query(() => [MemberOutput])
  async getMembers(
    @Ctx() { prisma }: QueryContext,
    @Arg("groupChatId") groupChatId: string,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<MemberOutput[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: any = await prisma.$queryRaw`
        SELECT m.id as id, m.group_chat_id as groupChatId, m.user_account_id as userAccountId, m.role as role, m.created_at as createdAt, m.updated_at as updatedAt
        FROM group_chats AS gc JOIN members AS m ON gc.id = m.group_chat_id
        WHERE gc.disabled = 'false' AND m.group_chat_id = ${groupChatId}
		AND EXISTS (SELECT 1 FROM members AS m2 WHERE m2.group_chat_id = m.group_chat_id AND m2.user_account_id = ${userAccountId})`;
    this.logger.debug("members:", members);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return members.map((member: any) => {
      return {
        id: member.id,
        groupChatId: member.groupChatId,
        userAccountId: member.userAccountId,
        role: member.role,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      };
    });
  }

  @Query(() => MessageOutput)
  async getMessage(
    @Ctx() { prisma }: QueryContext,
    @Arg("messageId") messageId: string,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<MessageOutput> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any = await prisma.$queryRaw`
        SELECT m.id as id, m.group_chat_id as groupChatId, m.user_account_id as userAccountId, m.text as text, m.created_at as createdAt, m.updated_at as updatedAt
	    FROM group_chats AS gc JOIN messages AS m ON gc.id = m.group_chat_id
        WHERE gc.disabled = 'false' AND m.disabled = 'false' AND m.id = ${messageId}
        AND EXISTS ( SELECT 1 FROM members AS mem WHERE mem.group_chat_id = m.group_chat_id AND mem.user_account_id = ${userAccountId})`;
    if (!messages.length) {
      throw new Error("not found");
    }
    const message = messages[0];
    this.logger.debug("message:", message);
    return {
      id: message.id,
      groupChatId: message.groupChatId,
      userAccountId: message.userAccountId,
      text: message.text,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
  @Query(() => [MessageOutput])
  async getMessages(
    @Ctx() { prisma }: QueryContext,
    @Arg("groupChatId") groupChatId: string,
    @Arg("userAccountId") userAccountId: string,
  ): Promise<MessageOutput[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any = await prisma.$queryRaw`
        SELECT m.id as id, m.group_chat_id as groupChatId, m.user_account_id as userAccountId, m.text as text, m.created_at as createdAt, m.updated_at as updatedAt
	    FROM group_chats AS gc JOIN messages AS m ON gc.id = m.group_chat_id
        WHERE gc.disabled = 'false' AND m.disabled = 'false' AND m.group_chat_id = ${groupChatId}
        AND EXISTS (SELECT 1 FROM members AS mem WHERE mem.group_chat_id = m.group_chat_id AND mem.user_account_id = ${userAccountId})`;
    this.logger.debug("messages:", messages);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return messages.map((message: any) => {
      return {
        id: message.id,
        groupChatId: message.groupChatId,
        userAccountId: message.userAccountId,
        text: message.text,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      };
    });
  }
}

export { QueryContext, GroupChatQueryResolver };
