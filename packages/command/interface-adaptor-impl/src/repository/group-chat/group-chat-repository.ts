import {
  GroupChat,
  type GroupChatEvent,
  type GroupChatEventRecord,
  type GroupChatId,
  manifestOf,
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

/** Manifest for the aggregate-state payload written to the snapshot table. */
export const SNAPSHOT_MANIFEST = manifestOf("GroupChat");

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
      const eventEnvelope = toEventEnvelope(event, snapshot);
      if (eventEnvelope.type === "err") {
        return eventEnvelope;
      }
      // The first event creates the aggregate; `seq_nr === 1` replaces the old
      // `isCreated` flag, which is no longer part of the v5 payload.
      if (snapshot.sequenceNumber === 1 || snapshotDecider?.(event, snapshot)) {
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
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      const eventEnvelope = toEventEnvelope(event, snapshot);
      if (eventEnvelope.type === "err") {
        return Promise.resolve(eventEnvelope);
      }
      return eventStore.persistEvent(eventEnvelope.value);
    },

    storeEventAndSnapshot(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<void, EventStoreError>> {
      const eventEnvelope = toEventEnvelope(event, snapshot);
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
      const records: GroupChatEventRecord[] = eventsResult.value.map(
        (envelope) => ({
          event: envelope.payload,
          seqNr: envelope.seqNr,
        }),
      );
      if (snapshot === undefined) {
        return GroupChat.replayFromEvents(id, records);
      }
      return GroupChat.replay(records, snapshot.aggregate);
    },
  });
}

/**
 * ESA v5 locks on the journal's continuous `seq_nr` and compares it with the
 * head, so the aggregate's own sequence number is the concurrency token. The
 * event payload stays pure; the envelope carries the metadata.
 */
function toEventEnvelope(
  event: GroupChatEvent,
  snapshot: GroupChat,
): Result<EventEnvelope<GroupChatEvent>, EventStoreError> {
  return EventEnvelope.create({
    aggregateId: snapshot.id,
    seqNr: snapshot.sequenceNumber,
    occurredAt: new Date(),
    manifest: manifestOf(event.typeName),
    payload: event,
  });
}

function toSnapshotEnvelope(
  snapshot: GroupChat,
): Result<SnapshotEnvelope<GroupChat>, EventStoreError> {
  return SnapshotEnvelope.create({
    seqNr: snapshot.sequenceNumber,
    manifest: SNAPSHOT_MANIFEST,
    aggregate: snapshot,
  });
}

function retentionCriteriaOf(numberOfEvents: number): SnapshotDecider {
  if (!Number.isSafeInteger(numberOfEvents) || numberOfEvents <= 0) {
    throw new Error(
      `withRetention(numberOfEvents) requires a positive integer, got ${numberOfEvents}`,
    );
  }
  return (_event: GroupChatEvent, snapshot: GroupChat) =>
    snapshot.sequenceNumber % numberOfEvents === 0;
}

export const GroupChatRepository = Object.freeze({
  create,
  retentionCriteriaOf,
});
