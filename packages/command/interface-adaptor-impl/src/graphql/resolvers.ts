import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import {
  AddMemberInput,
  CreateGroupChatInput,
  DeleteGroupChatInput,
  DeleteMessageInput,
  PostMessageInput,
  RemoveMemberInput,
  RenameGroupChatInput,
} from "./inputs";
import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import {
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import * as E from "fp-ts/Either";
import { GroupChatResult, HealthCheckResult, MessageResult } from "./object";
import { GraphQLError } from "graphql/error";

class ValidationError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "400",
      },
    });
  }
}

class OptimisticLockingError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "409",
      },
    });
  }
}

class InternalServerError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "500",
      },
    });
  }
}

interface CommandContext {
  groupChatCommandProcessor: GroupChatCommandProcessor;
}

@Resolver(() => GroupChatResult)
class GroupChatCommandResolver {
  @Query(() => HealthCheckResult)
  async healthCheck(): Promise<HealthCheckResult> {
    return { value: "OK" };
  }

  @Mutation(() => GroupChatResult)
  async createGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: CreateGroupChatInput,
  ): Promise<GroupChatResult> {
    const nameEither = GroupChatName.validate(input.name);
    if (E.isLeft(nameEither)) {
      throw new ValidationError(nameEither.left);
    }
    const name = nameEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    try {
      const groupChatEvent = await groupChatCommandProcessor.createGroupChat(
        name,
        executorId,
      );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => GroupChatResult)
  async deleteGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteGroupChatInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    try {
      const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
        groupChatId,
        executorId,
      );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => GroupChatResult)
  async renameGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RenameGroupChatInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const nameEither = GroupChatName.validate(input.name);
    if (E.isLeft(nameEither)) {
      throw new ValidationError(nameEither.left);
    }
    const name = nameEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    try {
      const groupChatEvent = await groupChatCommandProcessor.renameGroupChat(
        groupChatId,
        name,
        executorId,
      );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => GroupChatResult)
  async addMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: AddMemberInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const userAccountIdEither = UserAccountId.validate(input.userAccountId);
    if (E.isLeft(userAccountIdEither)) {
      throw new ValidationError(userAccountIdEither.left);
    }
    const userAccountId = userAccountIdEither.right;

    const role = input.role.toLowerCase() as MemberRole;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    try {
      const groupChatEvent =
        await groupChatCommandProcessor.addMemberToGroupChat(
          groupChatId,
          userAccountId,
          role,
          executorId,
        );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => GroupChatResult)
  async removeMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RemoveMemberInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const userAccountIdEither = UserAccountId.validate(input.userAccountId);
    if (E.isLeft(userAccountIdEither)) {
      throw new ValidationError(userAccountIdEither.left);
    }
    const userAccountId = userAccountIdEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;
    try {
      const groupChatEvent =
        await groupChatCommandProcessor.removeMemberFromGroupChat(
          groupChatId,
          userAccountId,
          executorId,
        );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => MessageResult)
  async postMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: PostMessageInput,
  ): Promise<MessageResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    const messageEither = Message.validate(
      MessageId.generate(),
      input.content,
      executorId,
      new Date(),
    );
    if (E.isLeft(messageEither)) {
      throw new ValidationError(messageEither.left);
    }
    const message = messageEither.right;

    try {
      const groupChatEvent =
        await groupChatCommandProcessor.postMessageToGroupChat(
          groupChatId,
          message,
          executorId,
        );
      return {
        groupChatId: groupChatEvent.aggregateId.asString(),
        messageId: message.id.asString(),
      };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }

  @Mutation(() => GroupChatResult)
  async deleteMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteMessageInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(input.groupChatId);
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationError(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const messageIdEither = MessageId.validate(input.messageId);
    if (E.isLeft(messageIdEither)) {
      throw new ValidationError(messageIdEither.left);
    }
    const messageId = messageIdEither.right;

    const executorIdEither = UserAccountId.validate(input.executorId);
    if (E.isLeft(executorIdEither)) {
      throw new ValidationError(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    try {
      const groupChatEvent =
        await groupChatCommandProcessor.deleteMessageFromGroupChat(
          groupChatId,
          messageId,
          executorId,
        );
      return { groupChatId: groupChatEvent.aggregateId.asString() };
    } catch (e) {
      if (e instanceof OptimisticLockingError) {
        throw new OptimisticLockingError(e.message);
      } else if (e instanceof Error) {
        throw new InternalServerError(e.message);
      } else {
        throw e;
      }
    }
  }
}

export {
  CommandContext,
  GroupChatCommandResolver,
  ValidationError,
  OptimisticLockingError,
  InternalServerError,
};
