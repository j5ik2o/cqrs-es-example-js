import {
  GroupChatId,
  GroupChatName,
  type MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import type {
  GroupChatCommandProcessor,
  ProcessError,
} from "cqrs-es-example-js-command-processor";
import type { Result } from "event-store-adapter-js";
import { GraphQLError } from "graphql/error";
import { Arg, Ctx, Mutation, Query, Resolver } from "type-graphql";
import {
  AddMemberInput,
  CreateGroupChatInput,
  DeleteGroupChatInput,
  DeleteMessageInput,
  EditMessageInput,
  PostMessageInput,
  RemoveMemberInput,
  RenameGroupChatInput,
  Role,
} from "./inputs";
import { GroupChatOutput, MessageOutput } from "./outputs";

interface CommandContext {
  groupChatCommandProcessor: GroupChatCommandProcessor;
}

@Resolver()
class GroupChatCommandResolver {
  @Query(() => String)
  async healthCheck(): Promise<string> {
    return "OK";
  }

  @Mutation(() => GroupChatOutput)
  async createGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => CreateGroupChatInput) input: CreateGroupChatInput,
  ): Promise<GroupChatOutput> {
    const name = orThrow(GroupChatName.validate(input.name));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.createGroupChat(name, executorId),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => GroupChatOutput)
  async deleteGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => DeleteGroupChatInput) input: DeleteGroupChatInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.deleteGroupChat(groupChatId, executorId),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => GroupChatOutput)
  async renameGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => RenameGroupChatInput) input: RenameGroupChatInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const name = orThrow(GroupChatName.validate(input.name));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.renameGroupChat(
        groupChatId,
        name,
        executorId,
      ),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => GroupChatOutput)
  async addMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => AddMemberInput) input: AddMemberInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const userAccountId = orThrow(UserAccountId.validate(input.userAccountId));
    const role = toMemberRole(input.role);
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.addMemberToGroupChat(
        groupChatId,
        userAccountId,
        role,
        executorId,
      ),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => GroupChatOutput)
  async removeMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => RemoveMemberInput) input: RemoveMemberInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const userAccountId = orThrow(UserAccountId.validate(input.userAccountId));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.removeMemberFromGroupChat(
        groupChatId,
        userAccountId,
        executorId,
      ),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => MessageOutput)
  async postMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => PostMessageInput) input: PostMessageInput,
  ): Promise<MessageOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const message = orThrow(
      Message.validate(
        MessageId.generate(),
        input.content,
        executorId,
        new Date(),
      ),
    );
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.postMessageToGroupChat(
        groupChatId,
        message,
        executorId,
      ),
    );
    return {
      groupChatId: groupChat.id.asString(),
      messageId: message.id.asString(),
    };
  }

  @Mutation(() => GroupChatOutput)
  async editMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => EditMessageInput) input: EditMessageInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const messageId = orThrow(MessageId.validate(input.messageId));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const message = orThrow(
      Message.validate(messageId, input.content, executorId, new Date()),
    );
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.editMessageInGroupChat(
        groupChatId,
        message,
        executorId,
      ),
    );
    return { groupChatId: groupChat.id.asString() };
  }

  @Mutation(() => GroupChatOutput)
  async deleteMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input", () => DeleteMessageInput) input: DeleteMessageInput,
  ): Promise<GroupChatOutput> {
    const groupChatId = orThrow(GroupChatId.validate(input.groupChatId));
    const messageId = orThrow(MessageId.validate(input.messageId));
    const executorId = orThrow(UserAccountId.validate(input.executorId));
    const [groupChat] = unwrap(
      await groupChatCommandProcessor.deleteMessageFromGroupChat(
        groupChatId,
        messageId,
        executorId,
      ),
    );
    return { groupChatId: groupChat.id.asString() };
  }
}

function orThrow<T>(result: Result<T, string>): T {
  if (result.type === "err") {
    throw new ValidationGraphQLError(result.error);
  }
  return result.value;
}

function toMemberRole(role: Role): MemberRole {
  switch (role) {
    case Role.ADMIN:
      return "administrator";
    case Role.MEMBER:
      return "member";
    default: {
      const exhaustive: never = role;
      throw new ValidationGraphQLError(`Invalid role: ${String(exhaustive)}`);
    }
  }
}

function unwrap<T>(result: Result<T, ProcessError>): T {
  if (result.type === "err") {
    throw toGraphQLError(result.error);
  }
  return result.value;
}

function toGraphQLError(error: ProcessError): GraphQLError {
  switch (error.kind) {
    case "optimistic-lock":
      return new OptimisticLockingGraphQLError(
        "A conflict occurred while attempting to save your changes. Please try again.",
        error,
      );
    case "domain":
      return new DomainLogicGraphQLError(
        "The request could not be processed due to a domain logic error. Please verify your data and try again.",
        error,
      );
    case "not-found":
      return new NotFoundGraphQLError(
        "The requested resource could not be found.",
        error,
      );
    default:
      return new InternalServerGraphQLError(
        "An unexpected error occurred. Please try again later.",
        error,
      );
  }
}

class ValidationGraphQLError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: "400" } });
  }
}

class NotFoundGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: { code: "404", cause: { message: cause?.message } },
    });
  }
}

class OptimisticLockingGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: { code: "409", cause: { message: cause?.message } },
    });
  }
}

class DomainLogicGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: { code: "422", cause: { message: cause?.message } },
    });
  }
}

class InternalServerGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: { code: "500", cause: { message: cause?.message } },
    });
  }
}

export {
  type CommandContext,
  GroupChatCommandResolver,
  ValidationGraphQLError,
  OptimisticLockingGraphQLError,
  InternalServerGraphQLError,
};
