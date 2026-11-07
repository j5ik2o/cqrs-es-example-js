import type { DynamoDBStreamEvent } from "aws-lambda";
import { applyReadModel } from "./apply-read-model";
import type { DeadLetterRecord, DeadLetterStore } from "./dead-letter-store";
import { decodeHeadStreamEvent } from "./dynamodb-adapter";
import {
  DeadLetterWriteError,
  JournalGapError,
  classifyFailure,
} from "./failures";
import type { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";
import {
  DEFAULT_RETRY_POLICY,
  RetryExhaustedError,
  type RetryPolicy,
  retryWithBackoff,
} from "./retry";
import {
  type SpannerPubSubMessage,
  decodeSpannerPubSubMessage,
} from "./spanner-pubsub-adapter";

export type ReadModelUpdaterOptions = {
  /** Per-event retry ceiling. Permanent journal gaps skip the retries. */
  retry?: RetryPolicy;
  /** When set, exhausted permanent failures become durable recovery tasks. */
  deadLetters?: DeadLetterStore;
  storeId?: string;
  projectionName?: string;
  projectionVersion?: string;
  sleep?: (millis: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
};

export type ApplyOptions = {
  /**
   * Lambda partial-batch mode: return the failed record identifiers instead of
   * throwing, so the event source mapping keeps the successful records.
   */
  reportBatchItemFailures?: boolean;
};

export type BatchItemFailure = { itemIdentifier: string };
export type BatchResult = { batchItemFailures: BatchItemFailure[] };

const DEFAULT_STORE_ID = "dynamodb-head";
const DEFAULT_PROJECTION_NAME = "group-chat-read-model";
const DEFAULT_PROJECTION_VERSION = "1";

/**
 * Thin composition over the provider adapters and the shared application
 * service. Provider handlers (AWS Lambda, Functions Framework) construct one of
 * these and forward their native payloads here; all projection rules live in
 * the shared `applyReadModel` service.
 */
export type ReadModelUpdater = {
  /** AWS / DynamoDB Streams path, reading the aggregate head table. */
  updateFromHeadStream(
    dynamodbStreamEvent: DynamoDBStreamEvent,
    options?: ApplyOptions,
  ): Promise<BatchResult | undefined>;
  /** Spanner Change Streams / Pub/Sub path. */
  updateFromSpannerPubSub(
    spannerPubSubMessage: SpannerPubSubMessage,
    options?: ApplyOptions,
  ): Promise<BatchResult | undefined>;
  /** Provider-neutral path. */
  apply(
    inputs: readonly ReadModelUpdaterInput[],
    options?: ApplyOptions,
  ): Promise<BatchResult | undefined>;
  /**
   * Applies one input with retries and throws on failure. Recovery uses this
   * after re-reading the journal, so a failure leaves the dead letter in place.
   */
  applyStrict(input: ReadModelUpdaterInput): Promise<void>;
  /** The committed read-model position for an aggregate. */
  getPosition(aggregateId: string): Promise<number>;
};

export namespace ReadModelUpdater {
  export function create(
    dao: GroupChatDao,
    journalReader?: JournalReader,
    options: ReadModelUpdaterOptions = {},
  ): ReadModelUpdater {
    const retryPolicy = options.retry ?? DEFAULT_RETRY_POLICY;
    const sleep = options.sleep ?? defaultSleep;
    const random = options.random ?? Math.random;
    const now = options.now ?? (() => new Date());
    const deadLetters = options.deadLetters;
    const projection = {
      storeId: options.storeId ?? DEFAULT_STORE_ID,
      projectionName: options.projectionName ?? DEFAULT_PROJECTION_NAME,
      projectionVersion:
        options.projectionVersion ?? DEFAULT_PROJECTION_VERSION,
    };

    async function applyStrict(input: ReadModelUpdaterInput): Promise<void> {
      await retryWithBackoff(
        () => applyWithGapFill(dao, journalReader, input),
        {
          policy: retryPolicy,
          sleep,
          random,
          now: () => now().getTime(),
          shouldRetry: (error) => classifyFailure(error).retryable,
        },
      );
    }

    async function apply(
      inputs: readonly ReadModelUpdaterInput[],
      applyOptions: ApplyOptions = {},
    ): Promise<BatchResult | undefined> {
      const failedIdentifiers = new Set<string>();
      const blockedAggregates = new Set<string>();

      for (const input of inputs) {
        const identifier = identifierOf(input);
        if (blockedAggregates.has(input.aggregateId)) {
          // Its predecessor has not been applied, so this event must not be
          // committed either. Leave it for a later delivery.
          failedIdentifiers.add(identifier);
          continue;
        }
        try {
          await applyStrict(input);
        } catch (error) {
          if (!(error instanceof RetryExhaustedError)) {
            throw error;
          }
          const classification = classifyFailure(error.lastError);
          if (classification.transient) {
            // A store-wide failure: let the delivery loop back off and retry
            // the whole batch rather than dead-lettering an innocent event.
            throw error;
          }
          if (deadLetters === undefined) {
            throw error;
          }
          const record = deadLetterRecordFor(
            input,
            error,
            classification.type,
            projection,
            now(),
          );
          try {
            await deadLetters.save(record);
          } catch (deadLetterError) {
            throw new DeadLetterWriteError(error, deadLetterError);
          }
          failedIdentifiers.add(identifier);
          blockedAggregates.add(input.aggregateId);
        }
      }

      if (applyOptions.reportBatchItemFailures === true) {
        return {
          batchItemFailures: [...failedIdentifiers].map((itemIdentifier) => ({
            itemIdentifier,
          })),
        };
      }
      return undefined;
    }

    return Object.freeze({
      apply,
      applyStrict,
      getPosition(aggregateId: string): Promise<number> {
        return dao.getPosition(aggregateId);
      },
      updateFromHeadStream(
        dynamodbStreamEvent: DynamoDBStreamEvent,
        applyOptions?: ApplyOptions,
      ): Promise<BatchResult | undefined> {
        return apply(decodeHeadStreamEvent(dynamodbStreamEvent), applyOptions);
      },
      updateFromSpannerPubSub(
        spannerPubSubMessage: SpannerPubSubMessage,
        applyOptions?: ApplyOptions,
      ): Promise<BatchResult | undefined> {
        return apply(
          decodeSpannerPubSubMessage(spannerPubSubMessage),
          applyOptions,
        );
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
      throw new JournalGapError(
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
    manifest: journalEvent.manifest,
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
      throw new JournalGapError(
        `Journal gap: expected seq_nr ${expected} but got ${event.seqNr}`,
      );
    }
    expected += 1;
  }
  if (expected !== toSeqNr + 1) {
    throw new JournalGapError(
      `Journal is missing seq_nr ${expected}..${toSeqNr}`,
    );
  }
}

function identifierOf(input: ReadModelUpdaterInput): string {
  return (
    input.recordIdentifier ?? `${input.aggregateId}#${input.sequenceNumber}`
  );
}

function deadLetterRecordFor(
  input: ReadModelUpdaterInput,
  error: RetryExhaustedError,
  failureType: DeadLetterRecord["failureType"],
  projection: {
    storeId: string;
    projectionName: string;
    projectionVersion: string;
  },
  createdAt: Date,
): DeadLetterRecord {
  return {
    storeId: projection.storeId,
    projectionName: projection.projectionName,
    projectionVersion: projection.projectionVersion,
    aggregateId: input.aggregateId,
    seqNr: input.sequenceNumber,
    failureType,
    errorMessage: errorMessageOf(error.lastError),
    attempts: error.attempts,
    occurredAt: input.occurredAt,
    manifest: input.manifest,
    recordIdentifier: input.recordIdentifier,
    createdAt,
  };
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export { assertContiguous, journalEventToInput };
