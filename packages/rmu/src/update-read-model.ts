import type { DynamoDBStreamEvent } from "aws-lambda";
import { applyReadModel } from "./apply-read-model";
import type { DeadLetterNotifier } from "./dead-letter-notifier";
import type { DeadLetterRecord, DeadLetterStore } from "./dead-letter-store";
import { decodeHeadStreamEvent } from "./dynamodb-adapter";
import {
  DeadLetterWriteError,
  JournalGapError,
  PayloadDecodeError,
  classifyFailure,
} from "./failures";
import type { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import {
  type ReadModelDecodeFailure,
  type ReadModelInput,
  type ReadModelUpdaterInput,
  isDecodeFailure,
} from "./read-model-updater-input";
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
  /**
   * Maximum dead-letter rows written per aggregate in one `apply` call. The
   * first failure is always recorded; events blocked behind it are recorded up
   * to this limit, and the rest stay with the delivery retry. Defaults to 100.
   */
  deadLetterBatchLimit?: number;
  /**
   * Best-effort notification of a persisted recovery task (for example SQS).
   * The durable task is authoritative; a notify failure never changes delivery.
   */
  notifier?: DeadLetterNotifier;
  onNotificationError?: (error: unknown, record: DeadLetterRecord) => void;
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
const DEFAULT_DEAD_LETTER_BATCH_LIMIT = 100;

/**
 * Why an aggregate stopped advancing in this batch. Later events of the same
 * aggregate are dead-lettered as `projection-blocked` up to the per-aggregate
 * limit, so one corrupt or unprojectable event does not hide its tail.
 */
type BlockedAggregate = {
  seqNr: number;
  failureType: DeadLetterRecord["failureType"];
  message: string;
};

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
  /** Provider-neutral path. Decode failures are dead-lettered, not applied. */
  apply(
    inputs: readonly ReadModelInput[],
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
    const deadLetterBatchLimit = positiveInteger(
      options.deadLetterBatchLimit,
      DEFAULT_DEAD_LETTER_BATCH_LIMIT,
    );
    const notifier = options.notifier;
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
      inputs: readonly ReadModelInput[],
      applyOptions: ApplyOptions = {},
    ): Promise<BatchResult | undefined> {
      const failedIdentifiers = new Set<string>();
      const blockedAggregates = new Map<string, BlockedAggregate>();
      const deadLetterCounts = new Map<string, number>();

      for (const input of inputs) {
        const identifier = identifierOf(input);
        const blocked = blockedAggregates.get(input.aggregateId);
        if (blocked !== undefined) {
          // Its predecessor has not been applied, so this event must not be
          // committed either. Record it (bounded) and leave it for redelivery.
          await recordBlockedFailure(input, blocked, deadLetterCounts);
          failedIdentifiers.add(identifier);
          continue;
        }
        if (isDecodeFailure(input)) {
          if (await recordDecodeFailure(input)) {
            // Already projected by a normal delivery or an earlier recovery.
            continue;
          }
          failedIdentifiers.add(identifier);
          blockedAggregates.set(input.aggregateId, {
            seqNr: input.sequenceNumber,
            failureType: "payload-decode",
            message: input.errorMessage,
          });
          deadLetterCounts.set(input.aggregateId, 1);
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
          await notify(
            await persistDeadLetter(
              deadLetters,
              deadLetterRecordFor(
                input,
                error,
                classification.type,
                projection,
                now(),
              ),
              error,
            ),
          );
          failedIdentifiers.add(identifier);
          blockedAggregates.set(input.aggregateId, {
            seqNr: input.sequenceNumber,
            failureType: classification.type,
            message: errorMessageOf(error.lastError),
          });
          deadLetterCounts.set(input.aggregateId, 1);
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

    /**
     * Persists a recovery task for an undecodable payload. Returns true when the
     * event is already at or behind the committed position, so a stale duplicate
     * (for example the head record retried after recovery) is not dead-lettered
     * again. Returns false when a new task was recorded and the aggregate must
     * stop advancing.
     */
    async function recordDecodeFailure(
      input: ReadModelDecodeFailure,
    ): Promise<boolean> {
      const position = await dao.getPosition(input.aggregateId);
      if (input.sequenceNumber <= position) {
        return true;
      }
      const originalError = new PayloadDecodeError(
        input.aggregateId,
        input.sequenceNumber,
        input.errorMessage,
      );
      if (deadLetters === undefined) {
        // Without a durable task the event cannot be safely skipped, so fail
        // the delivery and let the provider retry it.
        throw originalError;
      }
      await notify(
        await persistDeadLetter(
          deadLetters,
          decodeFailureRecordFor(input, projection, now()),
          originalError,
        ),
      );
      return false;
    }

    /**
     * Records an event that could not be considered because an earlier event of
     * the same aggregate failed. The per-aggregate limit keeps one head image
     * with a long tail from flooding the recovery table; the remainder stays
     * with the provider retry and is recorded on the next delivery.
     */
    async function recordBlockedFailure(
      input: ReadModelInput,
      blocked: BlockedAggregate,
      counts: Map<string, number>,
    ): Promise<void> {
      if (deadLetters === undefined) {
        return;
      }
      const count = counts.get(input.aggregateId) ?? 0;
      if (count >= deadLetterBatchLimit) {
        return;
      }
      // A recovery may already have advanced past this event.
      const position = await dao.getPosition(input.aggregateId);
      if (input.sequenceNumber <= position) {
        return;
      }
      counts.set(input.aggregateId, count + 1);
      const message = `Blocked by seq_nr ${blocked.seqNr} (${blocked.failureType}): ${blocked.message}`;
      const record: DeadLetterRecord = {
        storeId: projection.storeId,
        projectionName: projection.projectionName,
        projectionVersion: projection.projectionVersion,
        aggregateId: input.aggregateId,
        seqNr: input.sequenceNumber,
        failureType: "projection-blocked",
        errorMessage: message,
        attempts: 1,
        occurredAt: input.occurredAt,
        manifest: input.manifest,
        recordIdentifier: input.recordIdentifier,
        createdAt: now(),
      };
      await notify(
        await persistDeadLetter(deadLetters, record, new Error(message)),
      );
    }

    async function persistDeadLetter(
      store: DeadLetterStore,
      record: DeadLetterRecord,
      originalError: unknown,
    ): Promise<DeadLetterRecord> {
      try {
        await store.save(record);
        return record;
      } catch (deadLetterError) {
        throw new DeadLetterWriteError(originalError, deadLetterError);
      }
    }

    /**
     * A notification is an accelerator, not the durable record: the recovery
     * task in MySQL stays authoritative, so a transport failure is reported to
     * the caller's hook and never retried into the delivery loop.
     */
    async function notify(record: DeadLetterRecord): Promise<void> {
      if (notifier === undefined) {
        return;
      }
      try {
        await notifier.notify(record);
      } catch (error) {
        try {
          options.onNotificationError?.(error, record);
        } catch {
          // The durable task is already committed; a failing hook must not
          // change the delivery outcome either.
        }
      }
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
    kind: "event",
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

function identifierOf(input: ReadModelInput): string {
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

function decodeFailureRecordFor(
  input: ReadModelDecodeFailure,
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
    failureType: "payload-decode",
    errorMessage: input.errorMessage,
    attempts: 1,
    occurredAt: input.occurredAt,
    manifest: input.manifest,
    recordIdentifier: input.recordIdentifier,
    createdAt,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

export { assertContiguous, journalEventToInput };
