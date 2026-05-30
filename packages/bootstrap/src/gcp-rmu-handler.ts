import { type CloudEvent, cloudEvent } from "@google-cloud/functions-framework";
import { PrismaClient } from "@prisma/client";
import {
  GroupChatDao,
  type PubSubMessage,
  ReadModelUpdater,
} from "cqrs-es-example-js-rmu";

/**
 * GCP RMU handler (thin adapter). Functions Framework entry point for the
 * Spanner read-model pipeline: it only decodes the Pub/Sub trigger and forwards
 * to the shared, provider-neutral read-model service. All projection rules live
 * in `ReadModelUpdater` / `applyReadModel`.
 *
 * Deploy/run with:
 *   functions-framework --target=readModelUpdater --signature-type=cloudevent
 */

type PubSubCloudEventData = {
  message: PubSubMessage;
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

cloudEvent<PubSubCloudEventData>(
  "readModelUpdater",
  async (event: CloudEvent<PubSubCloudEventData>) => {
    // Throw on a malformed payload rather than returning: a thrown error makes
    // the Functions Framework respond non-2xx so Pub/Sub retries / dead-letters
    // the message instead of silently acking and dropping it.
    const message = extractPubSubMessage(event);
    await getReadModelUpdater().updateFromPubSub(message);
  },
);

function extractPubSubMessage(
  event: CloudEvent<PubSubCloudEventData>,
): PubSubMessage {
  const message = event.data?.message;
  if (message === undefined || typeof message.data !== "string") {
    throw new Error(
      "Invalid Pub/Sub CloudEvent: missing message.data string payload",
    );
  }
  return message;
}

export { getReadModelUpdater };
