import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import { Hono } from "hono";
import {
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

function groupChatController(
  app: Hono,
  groupChatCommandProcessor: GroupChatCommandProcessor,
): Hono {
  app.post("/group-chat/create", async (c) => {
    const { name, executorId } = await c.req.parseBody();
    const _name = GroupChatName.of(name as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent = await groupChatCommandProcessor.createGroupChat(
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/delete", async (c) => {
    const { id, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
      _id,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/rename", async (c) => {
    const { id, name, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _name = GroupChatName.of(name as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent = await groupChatCommandProcessor.renameGroupChat(
      _id,
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/add-member", async (c) => {
    const { id, memberId, memberRole, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _memberId = UserAccountId.of(memberId as string);
    const _memberRole = memberRole as MemberRole;
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent = await groupChatCommandProcessor.addMemberToGroupChat(
      _id,
      _memberId,
      _memberRole,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/remove-member", async (c) => {
    const { id, memberId, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _memberId = UserAccountId.of(memberId as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent =
      await groupChatCommandProcessor.removeMemberFromGroupChat(
        _id,
        _memberId,
        _executorId,
      );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/post-message", async (c) => {
    const { id, message, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _executorId = UserAccountId.of(executorId as string);
    const _message = Message.of(
      MessageId.generate(),
      message as string,
      _executorId,
      new Date(),
    );
    const groupChatEvent =
      await groupChatCommandProcessor.postMessageToGroupChat(
        _id,
        _message,
        _executorId,
      );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/delete-message", async (c) => {
    const { id, messageId, executorId } = await c.req.parseBody();
    const _id = GroupChatId.of(id as string);
    const _messageId = MessageId.of(messageId as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChatEvent =
      await groupChatCommandProcessor.deleteMessageFromGroupChat(
        _id,
        _messageId,
        _executorId,
      );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  return app;
}

export { groupChatController };
