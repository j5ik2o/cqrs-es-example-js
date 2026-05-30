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
    const message = extractPubSubMessage(event);
    if (message === undefined) {
      return;
    }
    await getReadModelUpdater().updateFromPubSub(message);
  },
);

function extractPubSubMessage(
  event: CloudEvent<PubSubCloudEventData>,
): PubSubMessage | undefined {
  const message = event.data?.message;
  if (message === undefined || typeof message.data !== "string") {
    return undefined;
  }
  return message;
}

export { getReadModelUpdater };
