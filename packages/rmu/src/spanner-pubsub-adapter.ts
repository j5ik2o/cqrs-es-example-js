import { convertJSONToGroupChatEvent } from "cqrs-es-example-js-command-domain";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

/**
 * Minimal Spanner Pub/Sub message shape (provider-SDK-free). `data` is the base64
 * payload produced by the Spanner change-stream bridge: the same
 * `{ type, data }` event envelope the event store serializes.
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
 */
function decodeSpannerPubSubMessage(
  spannerPubSubMessage: SpannerPubSubMessage,
): ReadModelUpdaterInput[] {
  const spannerPubSubPayload = JSON.parse(
    Buffer.from(spannerPubSubMessage.data, "base64").toString("utf-8"),
  );
  const groupChatEvent = convertJSONToGroupChatEvent(spannerPubSubPayload);
  const spannerPubSubAttributes = spannerPubSubMessage.attributes ?? {};
  const observedAt = parseSpannerPubSubObservedAt(
    spannerPubSubAttributes.commitTimestamp ?? spannerPubSubMessage.publishTime,
  );
  return [
    {
      event: groupChatEvent,
      aggregateId: groupChatEvent.aggregateId.asString(),
      sequenceNumber: groupChatEvent.sequenceNumber,
      sourceProvider: "spanner",
      observedAt,
      position:
        spannerPubSubAttributes.commitTimestamp ??
        spannerPubSubMessage.messageId,
    },
  ];
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
