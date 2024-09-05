import type {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import type * as TE from "fp-ts/TaskEither";

class RepositoryError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "RepositoryError";
    this.cause = cause;
  }
}

interface GroupChatRepository {
  withRetention(numberOfEvents: number): GroupChatRepository;

  storeEvent(
    event: GroupChatEvent,
    version: number,
  ): TE.TaskEither<RepositoryError, void>;

  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): TE.TaskEither<RepositoryError, void>;

  store(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): TE.TaskEither<RepositoryError, void>;

  findById(
    id: GroupChatId,
  ): TE.TaskEither<RepositoryError, GroupChat | undefined>;
}

export { type GroupChatRepository, RepositoryError };
