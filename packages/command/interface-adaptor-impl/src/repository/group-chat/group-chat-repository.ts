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

type SnapshotDecider = (event: GroupChatEvent, snapshot: GroupChat) => boolean;

class GroupChatRepositoryImpl implements GroupChatRepository {
  private constructor(
    public readonly eventStore: EventStore<
      GroupChatId,
      GroupChat,
      GroupChatEvent
    >,
    private readonly snapshotDecider: SnapshotDecider | undefined,
  ) {}

  store(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): TE.TaskEither<RepositoryError, void> {
    if (
      event.isCreated ||
      (this.snapshotDecider !== undefined &&
        this.snapshotDecider(event, snapshot))
    ) {
      return this.storeEventAndSnapshot(event, snapshot);
    } else {
      return this.storeEvent(event, snapshot.version);
    }
  }

  storeEvent(
    event: GroupChatEvent,
    version: number,
  ): TE.TaskEither<RepositoryError, void> {
    return TE.tryCatch(
      () => this.eventStore.persistEvent(event, version),
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
  }

  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): TE.TaskEither<RepositoryError, void> {
    return TE.tryCatch(
      () => this.eventStore.persistEventAndSnapshot(event, snapshot),
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
  }

  findById(
    id: GroupChatId,
  ): TE.TaskEither<RepositoryError, GroupChat | undefined> {
    return TE.tryCatch(
      async () => {
        const snapshot = await this.eventStore.getLatestSnapshotById(id);
        if (snapshot === undefined) {
          return undefined;
        } else {
          const events = await this.eventStore.getEventsByIdSinceSequenceNumber(
            id,
            snapshot.sequenceNumber + 1,
          );
          return GroupChat.replay(events, snapshot);
        }
      },
      (reason) => {
        if (reason instanceof Error) {
          return new RepositoryError("Failed to find by id to error", reason);
        }
        return new RepositoryError(String(reason));
      },
    );
  }

  static of(
    eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>,
    snapshotDecider: SnapshotDecider | undefined = undefined,
  ): GroupChatRepository {
    return new GroupChatRepositoryImpl(eventStore, snapshotDecider);
  }

  withRetention(numberOfEvents: number): GroupChatRepository {
    return new GroupChatRepositoryImpl(
      this.eventStore,
      GroupChatRepositoryImpl.retentionCriteriaOf(numberOfEvents),
    );
  }

  static retentionCriteriaOf(numberOfEvents: number): SnapshotDecider {
    return (event: GroupChatEvent, _: GroupChat) => {
      return event.sequenceNumber % numberOfEvents == 0;
    };
  }
}

export { GroupChatRepositoryImpl, RepositoryError };
