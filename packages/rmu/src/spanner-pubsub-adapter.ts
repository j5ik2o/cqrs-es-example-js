import { convertJSONToGroupChatEvent } from "cqrs-es-example-js-command-domain";
import type { ReadModelInput } from "./read-model-updater-input";

/**
 * Minimal Spanner Pub/Sub message shape (provider-SDK-free). `data` is the base64
 * payload produced by the Spanner change-stream bridge: the pure domain JSON
 * written to the journal `payload` column.
 */
export type SpannerPubSubMessage = {
  data: string;
  attributes?: Record<string, string>;
  messageId?: string;
  publishTime?: string;
};

/**
 * Spanner adapter: decodes a Pub/Sub message into one provider-neutral
 * `ReadModelUpdaterInput`. Returns an array for symmetry with the DynamoDB
 * adapter.
 *
 * ESA v5 keeps the aggregate id, sequence number and occurrence time in the
 * journal columns; the bridge republishes them as message attributes, so the
 * payload itself contains only domain data.
 */
function decodeSpannerPubSubMessage(
  spannerPubSubMessage: SpannerPubSubMessage,
): ReadModelInput[] {
  const attributes = spannerPubSubMessage.attributes ?? {};
  const aggregateId = attributes.aggregateId;
  if (aggregateId === undefined || aggregateId === "") {
    throw new Error("Invalid Spanner Pub/Sub message: missing aggregateId");
  }
  const sequenceNumber = parseSequenceNumber(attributes.sequenceNumber);
  const commitTimestamp = attributes.commitTimestamp;
  const observedAt = parseSpannerPubSubObservedAt(
    commitTimestamp ?? spannerPubSubMessage.publishTime,
  );
  const envelope = {
    aggregateId,
    sequenceNumber,
    sourceProvider: "spanner" as const,
    observedAt,
    occurredAt: commitTimestamp === undefined ? undefined : observedAt,
    manifest: attributes.manifest,
    position: commitTimestamp ?? spannerPubSubMessage.messageId,
    recordIdentifier: spannerPubSubMessage.messageId,
  };
  try {
    const payload = JSON.parse(
      Buffer.from(spannerPubSubMessage.data, "base64").toString("utf-8"),
    );
    const event = convertJSONToGroupChatEvent(
      attachManifestType(payload, attributes.manifest ?? ""),
    );
    return [{ kind: "event", ...envelope, event }];
  } catch (error) {
    // Attributes still identify the journal event, so recovery can re-read the
    // authoritative payload instead of losing the message.
    return [
      {
        kind: "decode-failure",
        ...envelope,
        errorMessage: errorMessageOf(error),
      },
    ];
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseSequenceNumber(value: string | undefined): number {
  if (value === undefined) {
    throw new Error("Invalid Spanner Pub/Sub message: missing sequenceNumber");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid Spanner Pub/Sub message sequenceNumber: ${value}`);
  }
  return parsed;
}

function attachManifestType(json: unknown, manifest: string): unknown {
  if (typeof json !== "object" || json === null) {
    return json;
  }
  if ("type" in json || "typeName" in json) {
    return json;
  }
  const typeName = manifest.split("@")[0];
  return typeName === "" ? json : { ...json, typeName };
}

function parseSpannerPubSubObservedAt(value: string | undefined): Date {
  if (value === undefined) {
    throw new Error("Invalid observedAt timestamp: missing value");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid observedAt timestamp: ${value}`);
  }
  return parsed;
}

export { decodeSpannerPubSubMessage };
