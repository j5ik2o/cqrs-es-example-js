import {
  GroupChat,
  type GroupChatEvent,
  type GroupChatId,
} from "cqrs-es-example-js-command-domain";
import type {
  GroupChatRepository as GroupChatRepositoryContract,
  SnapshotDecider,
} from "cqrs-es-example-js-command-interface-adaptor-if";
import type {
  EventStore,
  EventStoreError,
  Result,
} from "event-store-adapter-js";

type GroupChatEventStore = EventStore<GroupChatId, GroupChat, GroupChatEvent>;

function create(
  eventStore: GroupChatEventStore,
  snapshotDecider?: SnapshotDecider,
): GroupChatRepositoryContract {
  return Object.freeze({
    withRetention(numberOfEvents: number): GroupChatRepositoryContract {
      return create(eventStore, retentionCriteriaOf(numberOfEvents));
    },

    store(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      if (event.isCreated || snapshotDecider?.(event, snapshot)) {
        return eventStore.persistEventAndSnapshot(event, snapshot);
      }
      return eventStore.persistEvent(event, snapshot.version);
    },

    storeEvent(
      event: GroupChatEvent,
      version: number,
    ): Promise<Result<void, EventStoreError>> {
      return eventStore.persistEvent(event, version);
    },

    storeEventAndSnapshot(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      return eventStore.persistEventAndSnapshot(event, snapshot);
    },

    async findById(id: GroupChatId): Promise<GroupChat | undefined> {
      const snapshot = await eventStore.getLatestSnapshotById(id);
      if (snapshot === undefined) {
        const events = await eventStore.getEventsByIdSinceSequenceNumber(id, 1);
        return GroupChat.replayFromEvents(events);
      }
      const events = await eventStore.getEventsByIdSinceSequenceNumber(
        id,
        snapshot.sequenceNumber + 1,
      );
      return GroupChat.replay(events, snapshot);
    },
  });
}

function retentionCriteriaOf(numberOfEvents: number): SnapshotDecider {
  return (event: GroupChatEvent) => event.sequenceNumber % numberOfEvents === 0;
}

export const GroupChatRepository = Object.freeze({
  create,
  retentionCriteriaOf,
});
