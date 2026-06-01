import { type CloudEvent, cloudEvent } from "@google-cloud/functions-framework";
import { PrismaClient } from "@prisma/client";
import {
  GroupChatDao,
  ReadModelUpdater,
  type SpannerPubSubMessage,
} from "cqrs-es-example-js-rmu";

/**
 * Spanner RMU handler (thin adapter). Functions Framework entry point for the
 * Spanner read-model pipeline: it only decodes the Pub/Sub trigger and forwards
 * to the shared, provider-neutral read-model service. All projection rules live
 * in `ReadModelUpdater` / `applyReadModel`.
 *
 * Deploy/run with:
 *   functions-framework --target=readModelUpdater --signature-type=cloudevent
 */

type SpannerPubSubCloudEventData = {
  message: SpannerPubSubMessage;
  subscription?: string;
};

let readModelUpdater: ReadModelUpdater | undefined;

function getReadModelUpdater(): ReadModelUpdater {
  if (readModelUpdater !== undefined) {
    return readModelUpdater;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  readModelUpdater = ReadModelUpdater.create(GroupChatDao.create(prisma));
  return readModelUpdater;
}

cloudEvent<SpannerPubSubCloudEventData>(
  "readModelUpdater",
  async (spannerPubSubCloudEvent: CloudEvent<SpannerPubSubCloudEventData>) => {
    // Throw on a malformed payload rather than returning: a thrown error makes
    // the Functions Framework respond non-2xx so Pub/Sub retries / dead-letters
    // the message instead of silently acking and dropping it.
    const spannerPubSubMessage = extractSpannerPubSubMessage(
      spannerPubSubCloudEvent,
    );
    await getReadModelUpdater().updateFromSpannerPubSub(spannerPubSubMessage);
  },
);

function extractSpannerPubSubMessage(
  spannerPubSubCloudEvent: CloudEvent<SpannerPubSubCloudEventData>,
): SpannerPubSubMessage {
  const spannerPubSubMessage = spannerPubSubCloudEvent.data?.message;
  if (
    spannerPubSubMessage === undefined ||
    typeof spannerPubSubMessage.data !== "string"
  ) {
    throw new Error(
      "Invalid Pub/Sub CloudEvent: missing message.data string payload",
    );
  }
  return spannerPubSubMessage;
}

export { getReadModelUpdater };
