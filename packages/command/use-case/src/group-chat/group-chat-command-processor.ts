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

interface GroupChatCommandProcessor {
  createGroupChat: (
    name: GroupChatName,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  deleteGroupChat: (
    id: GroupChatId,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  renameGroupChat: (
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  addMemberToGroupChat: (
    id: GroupChatId,
    memberId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  removeMemberFromGroupChat: (
    id: GroupChatId,
    memberId: UserAccountId,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  postMessageToGroupChat: (
    id: GroupChatId,
    message: Message,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
  deleteMessageFromGroupChat: (
    id: GroupChatId,
    messageId: MessageId,
    executorId: UserAccountId,
  ) => TE.TaskEither<ProcessError, GroupChatEvent>;
}

function initialize(
  groupChatRepository: GroupChatRepository,
): GroupChatCommandProcessor {
  return {
    createGroupChat(
      name: GroupChatName,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        TE.right(GroupChatId.generate()),
        TE.chain((id) => TE.right(GroupChat.create(id, name, executorId))),
        TE.chain(([groupChat, groupChatCreated]) =>
          pipe(
            groupChatRepository.storeEventAndSnapshot(
              groupChatCreated,
              groupChat,
            ),
            TE.map(() => groupChatCreated),
          ),
        ),
      );
    },
    deleteGroupChat(
      id: GroupChatId,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.delete(executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
    renameGroupChat(
      id: GroupChatId,
      name: GroupChatName,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.rename(name, executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
    addMemberToGroupChat(
      id: GroupChatId,
      memberId: UserAccountId,
      memberRole: MemberRole,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.addMember(memberId, memberRole, executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
    removeMemberFromGroupChat(
      id: GroupChatId,
      memberId: UserAccountId,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.removeMemberById(memberId, executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
    postMessageToGroupChat(
      id: GroupChatId,
      message: Message,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.postMessage(message, executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
    deleteMessageFromGroupChat(
      id: GroupChatId,
      messageId: MessageId,
      executorId: UserAccountId,
    ): TE.TaskEither<ProcessError, GroupChatEvent> {
      return pipe(
        groupChatRepository.findById(id),
        TE.chainW((groupChatOpt) =>
          groupChatOpt === undefined
            ? TE.left(new ProcessError("Group chat not found"))
            : TE.right(groupChatOpt),
        ),
        TE.chainW((groupChat) =>
          pipe(
            groupChat.deleteMessage(messageId, executorId),
            TE.fromEither,
            TE.chainW(([groupChat, groupChatDeleted]) =>
              pipe(
                groupChatRepository.storeEvent(
                  groupChatDeleted,
                  groupChat.version,
                ),
                TE.map(() => groupChatDeleted),
              ),
            ),
          ),
        ),
        TE.mapLeft((e) => {
          if (e instanceof ProcessError) {
            return e;
          } else if (e instanceof RepositoryError) {
            return new ProcessError("Failed to delete group chat", e);
          } else if (e instanceof GroupChatDeleteError) {
            return new ProcessError("Failed to delete group chat", e);
          }
          throw e;
        }),
      );
    },
  };
}

const GroupChatCommandProcessor = {
  of(groupChatRepository: GroupChatRepository): GroupChatCommandProcessor {
    return initialize(groupChatRepository);
  },
};

export { GroupChatCommandProcessor, ProcessError };
