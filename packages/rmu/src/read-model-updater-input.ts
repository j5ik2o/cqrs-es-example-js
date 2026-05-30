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
  position?: string;
};
