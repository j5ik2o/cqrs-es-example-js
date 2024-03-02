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
import {
  GroupChatCommandProcessor,
  ProcessNotFoundError,
} from "cqrs-es-example-js-command-processor";
import {
  GroupChatError,
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import * as TE from "fp-ts/TaskEither";
import { GroupChatOutput, HealthCheckOutput, MessageOutput } from "./outputs";
import { GraphQLError } from "graphql/error";
import { pipe } from "fp-ts/function";
import { ProcessError } from "cqrs-es-example-js-command-processor";
import { RepositoryError } from "cqrs-es-example-js-command-interface-adaptor-if";
import { OptimisticLockError } from "event-store-adapter-js";
import { TaskEither } from "fp-ts/TaskEither";
import { Task } from "fp-ts/Task";

interface CommandContext {
  groupChatCommandProcessor: GroupChatCommandProcessor;
}

@Resolver()
class GroupChatCommandResolver {
  @Query(() => HealthCheckOutput)
  async healthCheck(): Promise<HealthCheckOutput> {
    return { value: "OK" };
  }

  @Mutation(() => GroupChatOutput)
  async createGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: CreateGroupChatInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatName(input.name),
      TE.chainW((validatedName) =>
        pipe(
          this.validateUserAccountId(input.executorId),
          TE.map((validatedExecutorId) => ({
            validatedName,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validatedName, validatedExecutorId }) =>
        groupChatCommandProcessor.createGroupChat(
          validatedName,
          validatedExecutorId,
        ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => GroupChatOutput)
  async deleteGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteGroupChatInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          this.validateUserAccountId(input.executorId),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedExecutorId }) =>
        groupChatCommandProcessor.deleteGroupChat(
          validateGroupChatId,
          validatedExecutorId,
        ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => GroupChatOutput)
  async renameGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RenameGroupChatInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          this.validateGroupChatName(input.name),
          TE.map((validatedGroupChatName) => ({
            validateGroupChatId,
            validatedGroupChatName,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedGroupChatName }) =>
        pipe(
          this.validateUserAccountId(input.executorId),
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
        }) =>
          groupChatCommandProcessor.renameGroupChat(
            validateGroupChatId,
            validatedGroupChatName,
            validatedExecutorId,
          ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => GroupChatOutput)
  async addMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: AddMemberInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          this.validateUserAccountId(input.userAccountId),
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
            this.validateUserAccountId(input.executorId),
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
        }) =>
          groupChatCommandProcessor.addMemberToGroupChat(
            validateGroupChatId,
            validatedUserAccountId,
            validatedRole,
            validatedExecutorId,
          ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => GroupChatOutput)
  async removeMember(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: RemoveMemberInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          this.validateUserAccountId(input.userAccountId),
          TE.map((validatedUserAccountId) => ({
            validateGroupChatId,
            validatedUserAccountId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedUserAccountId }) =>
        pipe(
          this.validateUserAccountId(input.executorId),
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
        }) =>
          groupChatCommandProcessor.removeMemberFromGroupChat(
            validateGroupChatId,
            validatedUserAccountId,
            validatedExecutorId,
          ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => MessageOutput)
  async postMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: PostMessageInput,
  ): Promise<MessageOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          this.validateUserAccountId(input.executorId),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedExecutorId }) =>
        pipe(
          this.validateMessage(
            MessageId.generate(),
            input.content,
            validatedExecutorId,
            new Date(),
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
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  @Mutation(() => GroupChatOutput)
  async deleteMessage(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("input") input: DeleteMessageInput,
  ): Promise<GroupChatOutput> {
    return pipe(
      this.validateGroupChatId(input.groupChatId),
      TE.chainW((validateGroupChatId) =>
        pipe(
          MessageId.validate(input.messageId),
          TE.fromEither,
          TE.map((validatedMessageId) => ({
            validateGroupChatId,
            validatedMessageId,
          })),
        ),
      ),
      TE.chainW(({ validateGroupChatId, validatedMessageId }) =>
        pipe(
          this.validateUserAccountId(input.executorId),
          TE.map((validatedExecutorId) => ({
            validateGroupChatId,
            validatedMessageId,
            validatedExecutorId,
          })),
        ),
      ),
      TE.chainW(
        ({ validateGroupChatId, validatedMessageId, validatedExecutorId }) =>
          groupChatCommandProcessor.deleteMessageFromGroupChat(
            validateGroupChatId,
            validatedMessageId,
            validatedExecutorId,
          ),
      ),
      TE.map((groupChatEvent) => ({
        groupChatId: groupChatEvent.aggregateId.asString(),
      })),
      TE.mapLeft(this.convertToError),
      this.toTask(),
    )();
  }

  private convertToError(error: string | ProcessError): Error {
    if (typeof error === "string") {
      return new ValidationGraphQLError(error);
    } else {
      if (
        error.cause instanceof RepositoryError &&
        error.cause.cause instanceof OptimisticLockError
      ) {
        return new OptimisticLockingGraphQLError(
          "A conflict occurred while attempting to save your changes. Please try again.",
          error,
        );
      } else if (error.cause instanceof GroupChatError) {
        return new DomainLogicGraphQLError(
          "The request could not be processed due to a domain logic error. Please verify your data and try again.",
          error,
        );
      } else if (error instanceof ProcessNotFoundError) {
        return new NotFoundGraphQLError(
          "The requested resource could not be found.",
          error,
        );
      }
      return new InternalServerGraphQLError(
        "An unexpected error occurred. Please try again later.",
        error,
      );
    }
  }

  private toTask<A, B>(): (_: TaskEither<A, B>) => Task<B> {
    return TE.fold<A, B, B>(
      (e) => () => Promise.reject(e),
      (r) => () => Promise.resolve(r),
    );
  }

  private validateGroupChatId(value: string): TaskEither<string, GroupChatId> {
    return TE.fromEither(GroupChatId.validate(value));
  }

  private validateUserAccountId(
    value: string,
  ): TaskEither<string, UserAccountId> {
    return TE.fromEither(UserAccountId.validate(value));
  }

  private validateGroupChatName(
    value: string,
  ): TaskEither<string, GroupChatName> {
    return TE.fromEither(GroupChatName.validate(value));
  }

  private validateMessage(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): TE.TaskEither<string, Message> {
    return TE.fromEither(Message.validate(id, content, senderId, sentAt));
  }
}

class ValidationGraphQLError extends GraphQLError {
  constructor(message: string) {
    super(message, {
      extensions: {
        code: "400",
      },
    });
  }
}

class NotFoundGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: {
        code: "404",
        cause: { message: cause?.message, stack: cause?.stack },
      },
    });
  }
}

class OptimisticLockingGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: {
        code: "409",
        cause: { message: cause?.message, stack: cause?.stack },
      },
    });
  }
}

class DomainLogicGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: {
        code: "422",
        cause: { message: cause?.message, stack: cause?.stack },
      },
    });
  }
}

class InternalServerGraphQLError extends GraphQLError {
  constructor(message: string, cause?: ProcessError) {
    super(message, {
      extensions: {
        code: "500",
        cause: { message: cause?.message, stack: cause?.stack },
      },
    });
  }
}

export {
  CommandContext,
  GroupChatCommandResolver,
  ValidationGraphQLError,
  OptimisticLockingGraphQLError,
  InternalServerGraphQLError,
};
