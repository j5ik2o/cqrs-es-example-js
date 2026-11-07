import type { DynamoDBStreamEvent } from "aws-lambda";
import { applyReadModel } from "./apply-read-model";
import { decodeHeadStreamEvent } from "./dynamodb-adapter";
import type { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";
import {
  type SpannerPubSubMessage,
  decodeSpannerPubSubMessage,
} from "./spanner-pubsub-adapter";

/**
 * Thin composition over the provider adapters and the shared application
 * service. Provider handlers (AWS Lambda, Functions Framework) construct one of
 * these and forward their native payloads here; all projection rules live in
 * the shared `applyReadModel` service.
 */
export type ReadModelUpdater = {
  /** AWS / DynamoDB Streams path, reading the aggregate head table. */
  updateFromHeadStream(dynamodbStreamEvent: DynamoDBStreamEvent): Promise<void>;
  /** Spanner Change Streams / Pub/Sub path. */
  updateFromSpannerPubSub(
    spannerPubSubMessage: SpannerPubSubMessage,
  ): Promise<void>;
  /** Provider-neutral path. */
  apply(inputs: readonly ReadModelUpdaterInput[]): Promise<void>;
};

export namespace ReadModelUpdater {
  export function create(
    dao: GroupChatDao,
    journalReader?: JournalReader,
  ): ReadModelUpdater {
    async function apply(
      inputs: readonly ReadModelUpdaterInput[],
    ): Promise<void> {
      for (const input of inputs) {
        await applyWithGapFill(dao, journalReader, input);
      }
    }
    return Object.freeze({
      apply,
      updateFromHeadStream(
        dynamodbStreamEvent: DynamoDBStreamEvent,
      ): Promise<void> {
        return apply(decodeHeadStreamEvent(dynamodbStreamEvent));
      },
      updateFromSpannerPubSub(
        spannerPubSubMessage: SpannerPubSubMessage,
      ): Promise<void> {
        return apply(decodeSpannerPubSubMessage(spannerPubSubMessage));
      },
    });
  }
}

/**
 * Drops duplicate and stale events, fills a sequence-number gap from the
 * journal, then applies the events in order. Each `applyReadModel` call writes
 * the read model and the position in one transaction, so a failure leaves the
 * position at the last committed event.
 */
async function applyWithGapFill(
  dao: GroupChatDao,
  journalReader: JournalReader | undefined,
  input: ReadModelUpdaterInput,
): Promise<void> {
  const currentSeqNr = await dao.getPosition(input.aggregateId);
  if (input.sequenceNumber <= currentSeqNr) {
    return;
  }
  if (input.sequenceNumber > currentSeqNr + 1) {
    if (journalReader === undefined) {
      throw new Error(
        `Aggregate ${input.aggregateId}: seq_nr ${input.sequenceNumber} follows position ${currentSeqNr} and no journal reader is configured`,
      );
    }
    const journalEvents = await journalReader.readEvents(
      input.aggregateId,
      currentSeqNr + 1,
      input.sequenceNumber - 1,
    );
    assertContiguous(currentSeqNr + 1, input.sequenceNumber - 1, journalEvents);
    for (const journalEvent of journalEvents) {
      await applyReadModel(dao, journalEventToInput(journalEvent));
    }
  }
  await applyReadModel(dao, input);
}

function journalEventToInput(
  journalEvent: JournalEvent,
): ReadModelUpdaterInput {
  return {
    event: journalEvent.event,
    aggregateId: journalEvent.aggregateId,
    sequenceNumber: journalEvent.seqNr,
    sourceProvider: "dynamodb",
    observedAt: journalEvent.occurredAt,
    occurredAt: journalEvent.occurredAt,
    position: `journal:${journalEvent.seqNr}`,
  };
}

function assertContiguous(
  fromSeqNr: number,
  toSeqNr: number,
  events: readonly JournalEvent[],
): void {
  let expected = fromSeqNr;
  for (const event of events) {
    if (event.seqNr !== expected) {
      throw new Error(
        `Journal gap: expected seq_nr ${expected} but got ${event.seqNr}`,
      );
    }
    expected += 1;
  }
  if (expected !== toSeqNr + 1) {
    throw new Error(`Journal is missing seq_nr ${expected}..${toSeqNr}`);
  }
}
