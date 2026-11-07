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
  event: GroupChatEvent;
  aggregateId: string;
  sequenceNumber: number;
  sourceProvider: SourceProvider;
  observedAt: Date;
  /**
   * The event's `occurred_at` from the storage envelope. For head stream
   * records this is authoritative; the payload may omit it. Falls back to the
   * decoded event's own timestamp when the provider has no envelope.
   */
  occurredAt?: Date;
  position?: string;
};
