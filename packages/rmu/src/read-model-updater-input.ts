import type { GroupChatEvent } from "cqrs-es-example-js-command-domain";

export type SourceProvider = "dynamodb" | "spanner";

/**
 * Provider-neutral wrapper handed to the shared read-model application service.
 * Provider-specific adapters (DynamoDB Streams, Pub/Sub) decode their native
 * payloads into this shape so the projection logic never sees provider types.
 *
 * Carries ordering/idempotency/diagnostics metadata in addition to the decoded
 * domain event: aggregate id, sequence number, source provider, the observed
 * timestamp, and an optional provider position (stream sequence number or
 * change-stream commit token).
 */
export type ReadModelUpdaterInput = {
  kind: "event";
  event: GroupChatEvent;
  aggregateId: string;
  sequenceNumber: number;
  sourceProvider: SourceProvider;
  observedAt: Date;
  /**
   * The event's `occurred_at` from the storage envelope. The v5 payload does
   * not carry it, so the adapter supplies it from the journal/head record.
   */
  occurredAt?: Date;
  /** The envelope manifest (`<event-type>@<schema-version>`), for diagnostics. */
  manifest?: string;
  position?: string;
  /**
   * Delivery record identity. A DynamoDB stream record can carry several
   * events, so the Lambda partial-batch response reports this identifier once
   * for every event that failed from that record.
   */
  recordIdentifier?: string;
};

/**
 * A delivery whose storage envelope was readable but whose domain payload was
 * not. The envelope still identifies the event, so the projection records a
 * durable recovery task instead of letting one undecodable payload fail the
 * whole stream record and lose its aggregate id and `seq_nr`.
 *
 * The task carries no event body: recovery re-reads the authoritative payload
 * from the journal.
 */
export type ReadModelDecodeFailure = {
  kind: "decode-failure";
  aggregateId: string;
  sequenceNumber: number;
  sourceProvider: SourceProvider;
  observedAt: Date;
  occurredAt?: Date;
  manifest?: string;
  position?: string;
  recordIdentifier?: string;
  /** The decode error, flattened so the task and notification can record it. */
  errorMessage: string;
};

/** One item produced by a provider adapter, decoded or not. */
export type ReadModelInput = ReadModelUpdaterInput | ReadModelDecodeFailure;

export function isDecodeFailure(
  input: ReadModelInput,
): input is ReadModelDecodeFailure {
  return input.kind === "decode-failure";
}
