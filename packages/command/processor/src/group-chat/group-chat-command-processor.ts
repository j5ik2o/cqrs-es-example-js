import type {
  GroupChat,
  GroupChatDeleteError,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  MemberRole,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import type {
  GroupChatRepository,
  RepositoryError,
} from "cqrs-es-example-js-command-interface-adaptor-if";
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";

class GroupChatCommandProcessor {
  private constructor(
    private readonly groupChatRepository: GroupChatRepository,
  ) {}

  createGroupChat(
    name: GroupChatName,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      TE.right(GroupChatId.generate()),
      TE.chain((id) => TE.right(GroupChat.create(id, name, executorId))),
      TE.chain(([groupChat, groupChatCreated]) =>
        pipe(
          this.groupChatRepository.store(groupChatCreated, groupChat),
          TE.map(() => groupChatCreated),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  deleteGroupChat(
    id: GroupChatId,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.deleteGroupChatAsync(groupChat, executorId),
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.store(groupChatDeleted, groupChat),
              TE.map(() => groupChatDeleted),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  renameGroupChat(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.renameGroupChatAsync(groupChat, name, executorId),
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.store(groupChatDeleted, groupChat),
              TE.map(() => groupChatDeleted),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  addMemberToGroupChat(
    id: GroupChatId,
    memberId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.addMemberAsync(groupChat, memberId, memberRole, executorId),
          TE.chainW(([groupChat, groupChatMemberAdded]) =>
            pipe(
              this.groupChatRepository.store(groupChatMemberAdded, groupChat),
              TE.map(() => groupChatMemberAdded),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  removeMemberFromGroupChat(
    id: GroupChatId,
    memberId: UserAccountId,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.removeMemberByIdAsync(groupChat, memberId, executorId),
          TE.chainW(([groupChat, groupChatMemberRemoved]) =>
            pipe(
              this.groupChatRepository.store(groupChatMemberRemoved, groupChat),
              TE.map(() => groupChatMemberRemoved),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  postMessageToGroupChat(
    id: GroupChatId,
    message: Message,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.postMessageAsync(groupChat, message, executorId),
          TE.chainW(([groupChat, groupChatMessagePosted]) =>
            pipe(
              this.groupChatRepository.store(groupChatMessagePosted, groupChat),
              TE.map(() => groupChatMessagePosted),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  deleteMessageFromGroupChat(
    id: GroupChatId,
    messageId: MessageId,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      this.groupChatRepository.findById(id),
      TE.chainW(this.getOrError),
      TE.chainW((groupChat) =>
        pipe(
          this.deleteMessageAsync(groupChat, messageId, executorId),
          TE.chainW(([groupChat, groupChatMessageDeleted]) =>
            pipe(
              this.groupChatRepository.store(
                groupChatMessageDeleted,
                groupChat,
              ),
              TE.map(() => groupChatMessageDeleted),
            ),
          ),
        ),
      ),
      TE.mapLeft(this.convertToProcessError),
    );
  }

  static of(
    groupChatRepository: GroupChatRepository,
  ): GroupChatCommandProcessor {
    return new GroupChatCommandProcessor(groupChatRepository);
  }

  private convertToProcessError(e: unknown): ProcessError {
    if (e instanceof ProcessError) {
      return e;
    }
    if (e instanceof RepositoryError) {
      return new ProcessInternalError("Failed to delete group chat", e);
    }
    if (e instanceof GroupChatDeleteError) {
      return new ProcessInternalError("Failed to delete group chat", e);
    }
    throw e;
  }

  private getOrError(
    groupChatOpt: GroupChat | undefined,
  ): TE.TaskEither<ProcessError, GroupChat> {
    return groupChatOpt === undefined
      ? TE.left(new ProcessNotFoundError("Group chat not found"))
      : TE.right(groupChatOpt);
  }

  private deleteGroupChatAsync(
    groupChat: GroupChat,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.delete(executorId));
  }

  private renameGroupChatAsync(
    groupChat: GroupChat,
    name: GroupChatName,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.rename(name, executorId));
  }

  private addMemberAsync(
    groupChat: GroupChat,
    memberId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.addMember(memberId, memberRole, executorId));
  }

  private removeMemberByIdAsync(
    groupChat: GroupChat,
    memberId: UserAccountId,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.removeMemberById(memberId, executorId));
  }

  private postMessageAsync(
    groupChat: GroupChat,
    message: Message,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.postMessage(message, executorId));
  }

  private deleteMessageAsync(
    groupChat: GroupChat,
    messageId: MessageId,
    executorId: UserAccountId,
  ) {
    return TE.fromEither(groupChat.deleteMessage(messageId, executorId));
  }
}

abstract class ProcessError extends Error {}

class ProcessInternalError extends ProcessError {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ProcessError";
    this.cause = cause;
  }
}

class ProcessNotFoundError extends ProcessError {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ProcessError";
    this.cause = cause;
  }
}

export {
  GroupChatCommandProcessor,
  ProcessError,
  ProcessInternalError,
  ProcessNotFoundError,
};
