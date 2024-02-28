import {
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
import {
  GroupChatRepository,
  RepositoryError,
} from "cqrs-es-example-js-command-interface-adaptor-if";
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";

class ProcessError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ProcessError";
    this.cause = cause;
  }
}

class GroupChatCommandProcessor {
  private constructor(
    private readonly groupChatRepository: GroupChatRepository,
  ) {}

  private convertToProcessError(e: unknown): ProcessError {
    if (e instanceof ProcessError) {
      return e;
    } else if (e instanceof RepositoryError) {
      return new ProcessError("Failed to delete group chat", e);
    } else if (e instanceof GroupChatDeleteError) {
      return new ProcessError("Failed to delete group chat", e);
    }
    throw e;
  }

  private getOrError(
    groupChatOpt: GroupChat | undefined,
  ): TE.TaskEither<ProcessError, GroupChat> {
    return groupChatOpt === undefined
      ? TE.left(new ProcessError("Group chat not found"))
      : TE.right(groupChatOpt);
  }

  createGroupChat(
    name: GroupChatName,
    executorId: UserAccountId,
  ): TE.TaskEither<ProcessError, GroupChatEvent> {
    return pipe(
      TE.right(GroupChatId.generate()),
      TE.chain((id) => TE.right(GroupChat.create(id, name, executorId))),
      TE.chain(([groupChat, groupChatCreated]) =>
        pipe(
          this.groupChatRepository.storeEventAndSnapshot(
            groupChatCreated,
            groupChat,
          ),
          TE.map(() => groupChatCreated),
        ),
      ),
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
          groupChat.delete(executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
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
          groupChat.rename(name, executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
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
          groupChat.addMember(memberId, memberRole, executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
              TE.map(() => groupChatDeleted),
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
          groupChat.removeMemberById(memberId, executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
              TE.map(() => groupChatDeleted),
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
          groupChat.postMessage(message, executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
              TE.map(() => groupChatDeleted),
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
          groupChat.deleteMessage(messageId, executorId),
          TE.fromEither,
          TE.chainW(([groupChat, groupChatDeleted]) =>
            pipe(
              this.groupChatRepository.storeEvent(
                groupChatDeleted,
                groupChat.version,
              ),
              TE.map(() => groupChatDeleted),
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
}

export { GroupChatCommandProcessor, ProcessError };
