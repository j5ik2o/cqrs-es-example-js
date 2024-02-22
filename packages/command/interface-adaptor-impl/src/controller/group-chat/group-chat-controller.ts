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
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
  });
  app.post(`${baseUri}/group-chats/delete`, async (c) => {
    const { group_chat_id, executor_id } = await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
      _groupChatId,
      _executorId,
    );
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
  });
  app.post(`${baseUri}/group-chats/rename`, async (c) => {
    const { group_chat_id, name, executor_id } = await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

    const _name = GroupChatName.of(name as string);

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.renameGroupChat(
      _groupChatId,
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChatEvent.aggregateId.asString }, 200);
  });
  app.post(`${baseUri}/group-chats/add-member`, async (c) => {
    const { group_chat_id, user_account_id, role, executor_id } =
      await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

    const userAccountIdEither = UserAccountId.validate(
      user_account_id as string,
    );
    if (E.isLeft(userAccountIdEither)) {
      throw new ValidationException(userAccountIdEither.left);
    }
    const _userAccountId = userAccountIdEither.right;

    const _role = role as MemberRole;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.addMemberToGroupChat(
      _groupChatId,
      _userAccountId,
      _role,
      _executorId,
    );
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
  });
  app.post(`${baseUri}/group-chats/remove-member`, async (c) => {
    const { group_chat_id, user_account_id, executor_id } = await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

    const userAccountIdEither = UserAccountId.validate(
      user_account_id as string,
    );
    if (E.isLeft(userAccountIdEither)) {
      throw new ValidationException(userAccountIdEither.left);
    }
    const _userAccountId = userAccountIdEither.right;

    const executorIdEither = UserAccountId.validate(executor_id as string);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const _executorId = executorIdEither.right;

    const groupChatEvent =
      await groupChatCommandProcessor.removeMemberFromGroupChat(
        _groupChatId,
        _userAccountId,
        _executorId,
      );
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
  });
  app.post(`${baseUri}/group-chats/post-message`, async (c) => {
    const { group_chat_id, message, executor_id } = await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

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
        _groupChatId,
        _message,
        _executorId,
      );
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
  });
  app.post(`${baseUri}/group-chats/delete-message`, async (c) => {
    const { group_chat_id, message_id, executor_id } = await c.req.json();

    const groupChatIdEither = GroupChatId.validate(group_chat_id as string);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const _groupChatId = groupChatIdEither.right;

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
        _groupChatId,
        _messageId,
        _executorId,
      );
    return c.json(
      { group_chat_id: groupChatEvent.aggregateId.asString() },
      200,
    );
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
