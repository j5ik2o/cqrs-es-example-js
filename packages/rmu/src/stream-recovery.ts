import type { AttributeValue } from "aws-lambda";
import { decodeHeadScanItems } from "./dynamodb-adapter";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

/** DynamoDB Streams keeps records for 24 hours (DY-15). */
export const STREAM_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Stops a pathological client from spinning forever on an expired iterator. */
const MAX_EXPIRED_ITERATOR_RETRIES = 3;

export type StreamRecordDescriptor = {
  eventName: "INSERT" | "MODIFY" | "REMOVE";
  sequenceNumber: string;
  /** NewImage, in Lambda attribute shape, already converted by the caller. */
  newImage?: Record<string, AttributeValue>;
  /** Epoch milliseconds, when the provider supplies it. */
  approximateCreationDateTime?: number;
};

export type StreamShardDescriptor = {
  shardId: string;
};

export type ShardIteratorPosition =
  | { type: "trim-horizon" }
  | { type: "after-sequence-number"; sequenceNumber: string };

/** The stream operations the processor needs, so tests can fake the provider. */
export type StreamClient = {
  listShards(): Promise<readonly StreamShardDescriptor[]>;
  getShardIterator(
    shardId: string,
    position: ShardIteratorPosition,
  ): Promise<string>;
  getRecords(
    iterator: string,
    limit: number,
  ): Promise<{
    records: readonly StreamRecordDescriptor[];
    nextIterator?: string;
  }>;
};

export type StreamPersistResult = {
  /** True when at least one record could not be applied and must be replayed. */
  failed: boolean;
};

export type StreamResynchronizeReason = "startup" | "retention" | "trimmed";

export type StreamProcessorOptions = {
  client: StreamClient;
  /** Full consistent Scan of the head table plus journal catch-up. */
  resynchronize: () => Promise<void>;
  /**
   * Applies one page of stream records. Returning `{ failed: true }` stops the
   * shard so later records are not committed past the failure.
   */
  persist: (
    records: readonly StreamRecordDescriptor[],
  ) => Promise<StreamPersistResult | undefined>;
  lastProcessedAt?: Date;
  /**
   * Per-shard sequence number to resume after. The caller keeps this across
   * passes so a caught-up reader polls the tail instead of replaying the whole
   * retained stream. A process restart starts empty, which deliberately
   * replays from TRIM_HORIZON and relies on the position guard for dedupe.
   */
  startAfter?: Readonly<Record<string, string>>;
  now?: () => Date;
  retentionMs?: number;
  /** Page size passed to `GetRecords`. */
  maxRecordsPerPage?: number;
  onResynchronize?: (reason: StreamResynchronizeReason) => void;
};

export type StreamProcessingResult = {
  processedRecords: number;
  resynchronizations: number;
  lastProcessedAt: Date;
  stoppedOnFailure: boolean;
  /** True when every shard reached an empty page (the stream tail). */
  reachedEnd: boolean;
  /** Per-shard sequence numbers to pass back as `startAfter` next time. */
  lastSequenceNumbers: Record<string, string>;
};

/**
 * True when the subscription may have missed more than Streams retains. An
 * unknown last position (first start) also requires the full reconciliation
 * DY-15 describes.
 */
export function needsFullResynchronization(
  lastProcessedAt: Date | undefined,
  now: Date,
  retentionMs: number = STREAM_RETENTION_MS,
): boolean {
  if (lastProcessedAt === undefined) {
    return true;
  }
  return now.getTime() - lastProcessedAt.getTime() >= retentionMs;
}

export function isExpiredIteratorError(error: unknown): boolean {
  return errorName(error) === "ExpiredIteratorException";
}

export function isTrimmedDataAccessError(error: unknown): boolean {
  return errorName(error) === "TrimmedDataAccessException";
}

/**
 * Reads the head stream shard by shard. `ExpiredIteratorException` only means
 * the 15-minute iterator expired, so the shard resumes after the last processed
 * sequence number. `TrimmedDataAccessException` or a position older than the
 * retention window means records are gone, so the whole head table is
 * reconciled first. A successful pass with no records returns so the caller can
 * poll again; the caller owns the backoff between failed passes.
 */
export async function processStream(
  options: StreamProcessorOptions,
): Promise<StreamProcessingResult> {
  const now = options.now ?? (() => new Date());
  const retentionMs = options.retentionMs ?? STREAM_RETENTION_MS;
  const maxRecordsPerPage = options.maxRecordsPerPage;
  let lastProcessedAt = options.lastProcessedAt;
  let resynchronizations = 0;

  if (needsFullResynchronization(lastProcessedAt, now(), retentionMs)) {
    await options.resynchronize();
    resynchronizations += 1;
    options.onResynchronize?.(
      lastProcessedAt === undefined ? "startup" : "retention",
    );
    lastProcessedAt = now();
  }

  const shards = await options.client.listShards();
  const lastSequenceNumbers: Record<string, string> = {
    ...(options.startAfter ?? {}),
  };
  let processedRecords = 0;
  let stoppedOnFailure = false;
  let reachedEnd = true;
  let trimmedResynchronized = false;

  for (const shard of shards) {
    let lastSequenceNumber: string | undefined =
      lastSequenceNumbers[shard.shardId];
    let iterator: string | undefined = await options.client.getShardIterator(
      shard.shardId,
      lastSequenceNumber === undefined
        ? { type: "trim-horizon" }
        : { type: "after-sequence-number", sequenceNumber: lastSequenceNumber },
    );
    let expiredIteratorRetries = 0;

    for (;;) {
      if (iterator === undefined) {
        break;
      }
      let page: {
        records: readonly StreamRecordDescriptor[];
        nextIterator?: string;
      };
      try {
        page = await options.client.getRecords(
          iterator,
          maxRecordsPerPage ?? 100,
        );
      } catch (error) {
        if (isExpiredIteratorError(error)) {
          expiredIteratorRetries += 1;
          if (expiredIteratorRetries > MAX_EXPIRED_ITERATOR_RETRIES) {
            throw error;
          }
          iterator = await options.client.getShardIterator(
            shard.shardId,
            lastSequenceNumber === undefined
              ? { type: "trim-horizon" }
              : {
                  type: "after-sequence-number",
                  sequenceNumber: lastSequenceNumber,
                },
          );
          continue;
        }
        if (isTrimmedDataAccessError(error)) {
          // Records are gone, so reconcile the head table and resume from the
          // oldest retained record. One scan per pass covers every shard.
          if (!trimmedResynchronized) {
            await options.resynchronize();
            resynchronizations += 1;
            options.onResynchronize?.("trimmed");
            trimmedResynchronized = true;
          }
          lastProcessedAt = now();
          delete lastSequenceNumbers[shard.shardId];
          lastSequenceNumber = undefined;
          iterator = await options.client.getShardIterator(shard.shardId, {
            type: "trim-horizon",
          });
          expiredIteratorRetries = 0;
          continue;
        }
        throw error;
      }

      const records = page.records;
      if (records.length > 0) {
        const result = await options.persist(records);
        processedRecords += records.length;
        lastProcessedAt = now();
        if (result?.failed === true) {
          stoppedOnFailure = true;
          break;
        }
        lastSequenceNumber = records[records.length - 1].sequenceNumber;
        lastSequenceNumbers[shard.shardId] = lastSequenceNumber;
      }

      iterator = page.nextIterator;
      if (iterator === undefined) {
        break;
      }
      if (records.length === 0) {
        // Idle shard: return to the caller instead of blocking other shards.
        break;
      }
    }

    if (stoppedOnFailure) {
      reachedEnd = false;
      break;
    }
  }

  return {
    processedRecords,
    resynchronizations,
    lastProcessedAt: lastProcessedAt ?? now(),
    stoppedOnFailure,
    reachedEnd,
    lastSequenceNumbers,
  };
}

export type HeadResynchronizeOptions = {
  scan: () => Promise<readonly Record<string, AttributeValue>[]>;
  apply: (inputs: readonly ReadModelUpdaterInput[]) => Promise<unknown>;
};

/**
 * Full reconciliation from a consistent head Scan (DY-15). Each head item
 * carries the latest sequence number; applying it fills the range from the
 * read-model position through the journal.
 */
export async function resynchronizeFromHead(
  options: HeadResynchronizeOptions,
): Promise<number> {
  const items = await options.scan();
  const inputs = decodeHeadScanItems(items);
  if (inputs.length > 0) {
    await options.apply(inputs);
  }
  return inputs.length;
}

function errorName(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  if ("name" in error && typeof error.name === "string") {
    return error.name;
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}
