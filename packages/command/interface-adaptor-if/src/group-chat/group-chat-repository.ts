import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import * as TE from "fp-ts/TaskEither";

class RepositoryError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "RepositoryError";
    this.cause = cause;
  }
}
interface GroupChatRepository {
  storeEvent(
    event: GroupChatEvent,
    version: number,
  ): TE.TaskEither<RepositoryError, void>;

  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): TE.TaskEither<RepositoryError, void>;

  findById(
    id: GroupChatId,
  ): TE.TaskEither<RepositoryError, GroupChat | undefined>;
}

export { GroupChatRepository, RepositoryError };
