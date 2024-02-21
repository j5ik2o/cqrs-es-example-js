import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import * as E from "fp-ts/lib/Either";
import { Hono } from "hono";
import {
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

function configureGroupChatController(
  app: Hono,
  groupChatCommandProcessor: GroupChatCommandProcessor,
): Hono {
  app.post("/group-chat/create", async (c) => {
    const { name, executorId } = await c.req.parseBody();

    const nameEither = GroupChatName.validate(name as string);
    if (E.isLeft(nameEither)) {
      throw new Error(nameEither.left);
    }
    const _name = nameEither.right;

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.createGroupChat(
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/delete", async (c) => {
    const { id, executorId } = await c.req.parseBody();

    const _id = GroupChatId.of(id as string);
    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
      _id,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/rename", async (c) => {
    const { id, name, executorId } = await c.req.parseBody();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new Error(idEither.left);
    }
    const _id = idEither.right;

    const _name = GroupChatName.of(name as string);

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.renameGroupChat(
      _id,
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post("/group-chat/add-member", async (c) => {
    const { id, memberId, memberRole, executorId } = await c.req.parseBody();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new Error(idEither.left);
    }
    const _id = idEither.right;

    const memberIdEither = UserAccountId.validate(memberId as string);
    if (E.isLeft(memberIdEither)) {
      throw new Error(memberIdEither.left);
    }
    const _memberId = memberIdEither.right;

    const _memberRole = memberRole as MemberRole;

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

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

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new Error(idEither.left);
    }
    const _id = idEither.right;

    const memberIdEither = UserAccountId.validate(memberId as string);
    if (E.isLeft(memberIdEither)) {
      throw new Error(memberIdEither.left);
    }
    const _memberId = memberIdEither.right;

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

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

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new Error(idEither.left);
    }
    const _id = idEither.right;

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const messageEither = Message.validate(
      MessageId.generate(),
      message as string,
      _executorId,
      new Date(),
    );
    if (E.isLeft(messageEither)) {
      throw new Error(messageEither.left);
    }
    const _message = messageEither.right;

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

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new Error(idEither.left);
    }
    const _id = idEither.right;

    const messageIdEither = MessageId.validate(messageId as string);
    if (E.isLeft(messageIdEither)) {
      throw new Error(messageIdEither.left);
    }
    const _messageId = messageIdEither.right;

    const executorIdEither = UserAccountId.validate(executorId as string);
    if (E.isLeft(executorIdEither)) {
      throw new Error(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent =
      await groupChatCommandProcessor.deleteMessageFromGroupChat(
        _id,
        _messageId,
        _executorId,
      );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.onError((e, c) => {
    return c.json({ error: e.message }, 500);
  });
  return app;
}

export { configureGroupChatController };
