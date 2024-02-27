import { EventStore, OptimisticLockError } from "event-store-adapter-js";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import {
  GroupChatRepository,
  RepositoryError,
} from "cqrs-es-example-js-command-interface-adaptor-if";
import * as TE from "fp-ts/TaskEither";

const GroupChatRepository = {
  of(
    eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>,
  ): GroupChatRepository {
    return {
      storeEvent(
        event: GroupChatEvent,
        version: number,
      ): TE.TaskEither<RepositoryError, void> {
        return TE.tryCatch(
          () => eventStore.persistEvent(event, version),
          (reason) => {
            if (reason instanceof OptimisticLockError) {
              return new RepositoryError(
                "Failed to store event and snapshot due to optimistic lock error",
                reason,
              );
            } else if (reason instanceof Error) {
              return new RepositoryError(
                "Failed to store event and snapshot due to error",
                reason,
              );
            }
            return new RepositoryError(String(reason));
          },
        );
      },
      storeEventAndSnapshot(
        event: GroupChatEvent,
        snapshot: GroupChat,
      ): TE.TaskEither<RepositoryError, void> {
        return TE.tryCatch(
          () => eventStore.persistEventAndSnapshot(event, snapshot),
          (reason) => {
            if (reason instanceof OptimisticLockError) {
              return new RepositoryError(
                "Failed to store event and snapshot due to optimistic lock error",
                reason,
              );
            } else if (reason instanceof Error) {
              return new RepositoryError(
                "Failed to store event and snapshot due to error",
                reason,
              );
            }
            return new RepositoryError(String(reason));
          },
        );
      },
      findById(
        id: GroupChatId,
      ): TE.TaskEither<RepositoryError, GroupChat | undefined> {
        return TE.tryCatch(
          async () => {
            const snapshot = await eventStore.getLatestSnapshotById(id);
            if (snapshot === undefined) {
              return undefined;
            } else {
              const events = await eventStore.getEventsByIdSinceSequenceNumber(
                id,
                snapshot.sequenceNumber + 1,
              );
              return GroupChat.replay(events, snapshot);
            }
          },
          (reason) => {
            if (reason instanceof Error) {
              return new RepositoryError(
                "Failed to find by id to error",
                reason,
              );
            }
            return new RepositoryError(String(reason));
          },
        );
      },
    };
  },
};

export { GroupChatRepository, RepositoryError };
