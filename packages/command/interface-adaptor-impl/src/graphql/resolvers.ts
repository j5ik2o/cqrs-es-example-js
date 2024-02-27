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
import * as TE from "fp-ts/TaskEither";
import { GroupChatResult, HealthCheckResult, MessageResult } from "./object";
import { GraphQLError } from "graphql/error";
import { pipe } from "fp-ts/function";
import { ProcessError } from "cqrs-es-example-js-command-use-case/dist/group-chat/group-chat-command-processor";
import { RepositoryError } from "cqrs-es-example-js-command-interface-adaptor-if";
import { OptimisticLockError } from "event-store-adapter-js";

class ValidationGraphQLError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "400",
      },
    });
  }
}

class OptimisticLockingGraphQLError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "409",
      },
    });
  }
}

class InternalServerGraphQLError extends GraphQLError {
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
    return pipe(
      TE.fromEither(GroupChatName.validate(input.name)),
      TE.chainW((validatedName) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validatedName,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validatedName, validatedExecutorId }) => {
        return groupChatCommandProcessor.createGroupChat(
          validatedName,
          validatedExecutorId,
        );
      }),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => GroupChatResult)
  async deleteGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteGroupChatInput,
  ): Promise<GroupChatResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedExecutorId }) => {
        return groupChatCommandProcessor.deleteGroupChat(
          validateGroupChatId,
          validatedExecutorId,
        );
      }),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => GroupChatResult)
  async renameGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RenameGroupChatInput,
  ): Promise<GroupChatResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(GroupChatName.validate(input.name)),
          TE.map((validatedGroupChatName) => ({
            validateGroupChatId,
            validatedGroupChatName,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedGroupChatName }) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedGroupChatName,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(
        ({
          validateGroupChatId,
          validatedGroupChatName,
          validatedExecutorId,
        }) => {
          return groupChatCommandProcessor.renameGroupChat(
            validateGroupChatId,
            validatedGroupChatName,
            validatedExecutorId,
          );
        },
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => GroupChatResult)
  async addMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: AddMemberInput,
  ): Promise<GroupChatResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.userAccountId)),
          TE.map((validatedUserAccountId) => ({
            validateGroupChatId,
            validatedUserAccountId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedUserAccountId }) =>
        pipe(
          TE.right(input.role.toLowerCase() as MemberRole),
          TE.map((validatedRole) => ({
            validateGroupChatId,
            validatedUserAccountId,
            validatedRole,
          })),
        ),
      ),
      TE.chainW(
        ({ validateGroupChatId, validatedUserAccountId, validatedRole }) =>
          pipe(
            TE.fromEither(UserAccountId.validate(input.executorId)),
            TE.map((validatedExecutorId) => ({
              validateGroupChatId,
              validatedUserAccountId,
              validatedRole,
              validatedExecutorId,
            })),
          ),
      ),
      TE.chainW(
        ({
          validateGroupChatId,
          validatedUserAccountId,
          validatedRole,
          validatedExecutorId,
        }) => {
          return groupChatCommandProcessor.addMemberToGroupChat(
            validateGroupChatId,
            validatedUserAccountId,
            validatedRole,
            validatedExecutorId,
          );
        },
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => GroupChatResult)
  async removeMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RemoveMemberInput,
  ): Promise<GroupChatResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.userAccountId)),
          TE.map((validatedUserAccountId) => ({
            validateGroupChatId,
            validatedUserAccountId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedUserAccountId }) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedUserAccountId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(
        ({
          validateGroupChatId,
          validatedUserAccountId,
          validatedExecutorId,
        }) => {
          return groupChatCommandProcessor.removeMemberFromGroupChat(
            validateGroupChatId,
            validatedUserAccountId,
            validatedExecutorId,
          );
        },
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => MessageResult)
  async postMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: PostMessageInput,
  ): Promise<MessageResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedExecutorId }) =>
        pipe(
          TE.fromEither(
            Message.validate(
              MessageId.generate(),
              input.content,
              validatedExecutorId,
              new Date(),
            ),
          ),
          TE.map((validatedMessage) => ({
            validateGroupChatId,
            validatedExecutorId,
            validatedMessage,
          })),
        ),
      ),
      TE.chainW(
        ({ validateGroupChatId, validatedExecutorId, validatedMessage }) =>
          pipe(
            groupChatCommandProcessor.postMessageToGroupChat(
              validateGroupChatId,
              validatedMessage,
              validatedExecutorId,
            ),
            TE.map((groupChatEvent) => ({
              groupChatId: groupChatEvent.aggregateId.asString(),
              messageId: validatedMessage.id.asString(),
            })),
          ),
      ),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }

  @Mutation(() => GroupChatResult)
  async deleteMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteMessageInput,
  ): Promise<GroupChatResult> {
    return pipe(
      TE.fromEither(GroupChatId.validate(input.groupChatId)),
      TE.chainW((validateGroupChatId) =>
        pipe(
          TE.fromEither(MessageId.validate(input.messageId)),
          TE.map((validatedMessageId) => ({
            validateGroupChatId,
            validatedMessageId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedMessageId }) =>
        pipe(
          TE.fromEither(UserAccountId.validate(input.executorId)),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedMessageId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(
        ({ validateGroupChatId, validatedMessageId, validatedExecutorId }) => {
          return groupChatCommandProcessor.deleteMessageFromGroupChat(
            validateGroupChatId,
            validatedMessageId,
            validatedExecutorId,
          );
        },
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft((error) => {
        if (typeof error === "string") {
          return new ValidationGraphQLError(error);
        } else if (error instanceof ProcessError) {
          if (
            error.cause instanceof RepositoryError &&
            error.cause.cause instanceof OptimisticLockError
          ) {
            return new OptimisticLockingGraphQLError(error.message);
          }
          return new InternalServerGraphQLError(error.message);
        } else {
          return new InternalServerGraphQLError("An unknown error occurred");
        }
      }),
      TE.fold(
        (e) => () => Promise.reject(e),
        (r) => () => Promise.resolve(r),
      ),
    )();
  }
}

export {
  CommandContext,
  GroupChatCommandResolver,
  ValidationGraphQLError,
  OptimisticLockingGraphQLError,
  InternalServerGraphQLError,
};
