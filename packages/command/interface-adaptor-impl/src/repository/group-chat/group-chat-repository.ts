import {
  GroupChat,
  type GroupChatEvent,
  type GroupChatId,
} from "cqrs-es-example-js-command-domain";
import type {
  GroupChatRepository as GroupChatRepositoryContract,
  SnapshotDecider,
} from "cqrs-es-example-js-command-interface-adaptor-if";
import {
  EventEnvelope,
  type EventStore,
  type EventStoreError,
  type Result,
  SnapshotEnvelope,
} from "event-store-adapter-js";

type GroupChatEventStore = EventStore<GroupChatEvent, GroupChat>;

function create(
  eventStore: GroupChatEventStore,
  snapshotDecider?: SnapshotDecider,
): GroupChatRepositoryContract {
  return Object.freeze({
    withRetention(numberOfEvents: number): GroupChatRepositoryContract {
      return create(eventStore, retentionCriteriaOf(numberOfEvents));
    },

    async store(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      const eventEnvelope = toEventEnvelope(event);
      if (eventEnvelope.type === "err") {
        return eventEnvelope;
      }
      if (event.isCreated || snapshotDecider?.(event, snapshot)) {
        const snapshotEnvelope = toSnapshotEnvelope(snapshot);
        if (snapshotEnvelope.type === "err") {
          return snapshotEnvelope;
        }
        return eventStore.persistEventAndSnapshot(
          eventEnvelope.value,
          snapshotEnvelope.value,
        );
      }
      return eventStore.persistEvent(eventEnvelope.value);
    },

    storeEvent(
      event: GroupChatEvent,
      _version: number,
    ): Promise<Result<void, EventStoreError>> {
      const eventEnvelope = toEventEnvelope(event);
      if (eventEnvelope.type === "err") {
        return Promise.resolve(eventEnvelope);
      }
      return eventStore.persistEvent(eventEnvelope.value);
    },

    storeEventAndSnapshot(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      const eventEnvelope = toEventEnvelope(event);
      if (eventEnvelope.type === "err") {
        return Promise.resolve(eventEnvelope);
      }
      const snapshotEnvelope = toSnapshotEnvelope(snapshot);
      if (snapshotEnvelope.type === "err") {
        return Promise.resolve(snapshotEnvelope);
      }
      return eventStore.persistEventAndSnapshot(
        eventEnvelope.value,
        snapshotEnvelope.value,
      );
    },

    async findById(id: GroupChatId): Promise<GroupChat | undefined> {
      const latestResult = await eventStore.getLatestSnapshotById(id);
      if (latestResult.type === "err") {
        throw new Error(latestResult.error.message);
      }
      const latest = latestResult.value;
      if (latest === undefined) {
        return undefined;
      }
      const snapshot = latest.snapshot;
      const fromSeqNr = snapshot === undefined ? 1 : snapshot.seqNr + 1;
      const eventsResult = await eventStore.getEventsByIdSinceSeqNr(
        id,
        fromSeqNr,
      );
      if (eventsResult.type === "err") {
        throw new Error(eventsResult.error.message);
      }
      const events = eventsResult.value.map((envelope) => envelope.payload);
      // ESA v5 has no separate aggregate version: the journal's head seq_nr is
      // the write counter. Keep the domain's `version` semantics by exposing it.
      if (snapshot === undefined) {
        return GroupChat.replayFromEvents(events)?.withVersion(
          latest.headSeqNr,
        );
      }
      return GroupChat.replay(events, snapshot.aggregate).withVersion(
        latest.headSeqNr,
      );
    },
  });
}

/**
 * ESA v5 locks on the journal's continuous `seq_nr` and compares it with the
 * head, so the domain event's own sequence number is the concurrency token.
 */
function toEventEnvelope(
  event: GroupChatEvent,
): Result<EventEnvelope<GroupChatEvent>, EventStoreError> {
  return EventEnvelope.create({
    aggregateId: event.aggregateId,
    seqNr: event.sequenceNumber,
    occurredAt: event.occurredAt,
    manifest: event.typeName,
    payload: event,
  });
}

function toSnapshotEnvelope(
  snapshot: GroupChat,
): Result<SnapshotEnvelope<GroupChat>, EventStoreError> {
  return SnapshotEnvelope.create({
    seqNr: snapshot.sequenceNumber,
    manifest: snapshot.typeName,
    aggregate: snapshot,
  });
}

function retentionCriteriaOf(numberOfEvents: number): SnapshotDecider {
  if (!Number.isSafeInteger(numberOfEvents) || numberOfEvents <= 0) {
    throw new Error(
      `withRetention(numberOfEvents) requires a positive integer, got ${numberOfEvents}`,
    );
  }
  return (event: GroupChatEvent) => event.sequenceNumber % numberOfEvents === 0;
}

export const GroupChatRepository = Object.freeze({
  create,
  retentionCriteriaOf,
});
