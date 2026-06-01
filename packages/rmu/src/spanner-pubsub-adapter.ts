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
  message: SpannerPubSubMessage,
): ReadModelUpdaterInput[] {
  const json = JSON.parse(
    Buffer.from(message.data, "base64").toString("utf-8"),
  );
  const event = convertJSONToGroupChatEvent(json);
  const attributes = message.attributes ?? {};
  const observedAt = parseObservedAt(
    attributes.commitTimestamp ?? message.publishTime,
  );
  return [
    {
      event,
      aggregateId: event.aggregateId.asString(),
      sequenceNumber: event.sequenceNumber,
      sourceProvider: "spanner",
      observedAt,
      position: attributes.commitTimestamp ?? message.messageId,
    },
  ];
}

function parseObservedAt(value: string | undefined): Date {
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
