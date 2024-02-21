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

class ValidationException extends Error {
  constructor(message: string) {
    super(message);
  }
}

function configureGroupChatController(
  app: Hono,
  baseUri: string,
  groupChatCommandProcessor: GroupChatCommandProcessor,
): Hono {
  app.post(`${baseUri}/group-chats/create`, async (c) => {
    const { name, executor_id } = await c.req.json();

    const nameEither = GroupChatName.validate(name as string);
    if (E.isLeft(nameEither)) {
      throw new ValidationException(nameEither.left);
    }
    const _name = nameEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.createGroupChat(
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post(`${baseUri}/group-chats/delete`, async (c) => {
    const { id, executor_id } = await c.req.json();

    const _id = GroupChatId.of(id as string);
    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
      _id,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post(`${baseUri}/group-chats/rename`, async (c) => {
    const { id, name, executor_id } = await c.req.json();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new ValidationException(idEither.left);
    }
    const _id = idEither.right;

    const _name = GroupChatName.of(name as string);

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.renameGroupChat(
      _id,
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post(`${baseUri}/group-chats/add-member`, async (c) => {
    const { id, member_id, role, executor_id } = await c.req.json();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new ValidationException(idEither.left);
    }
    const _id = idEither.right;

    const memberIdEither = UserAccountId.validate(member_id as string);
    if (E.isLeft(memberIdEither)) {
      throw new ValidationException(memberIdEither.left);
    }
    const _memberId = memberIdEither.right;

    const _memberRole = role as MemberRole;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
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
  app.post(`${baseUri}/group-chats/remove-member`, async (c) => {
    const { id, member_id, executor_id } = await c.req.json();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new ValidationException(idEither.left);
    }
    const _id = idEither.right;

    const memberIdEither = UserAccountId.validate(member_id as string);
    if (E.isLeft(memberIdEither)) {
      throw new ValidationException(memberIdEither.left);
    }
    const _memberId = memberIdEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
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
  app.post(`${baseUri}/group-chats/post-message`, async (c) => {
    const { id, message, executor_id } = await c.req.json();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new ValidationException(idEither.left);
    }
    const _id = idEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const messageEither = Message.validate(
      MessageId.generate(),
      message as string,
      _executorId,
      new Date(),
    );
    if (E.isLeft(messageEither)) {
      throw new ValidationException(messageEither.left);
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
  app.post(`${baseUri}/group-chats/delete-message`, async (c) => {
    const { id, message_id, executor_id } = await c.req.json();

    const idEither = GroupChatId.validate(id as string);
    if (E.isLeft(idEither)) {
      throw new ValidationException(idEither.left);
    }
    const _id = idEither.right;

    const messageIdEither = MessageId.validate(message_id as string);
    if (E.isLeft(messageIdEither)) {
      throw new ValidationException(messageIdEither.left);
    }
    const _messageId = messageIdEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
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
    if (e instanceof ValidationException) {
      return c.json({ error: e.message }, 400);
    }
    return c.json({ error: e.message }, 500);
  });
  return app;
}

export { configureGroupChatController };
