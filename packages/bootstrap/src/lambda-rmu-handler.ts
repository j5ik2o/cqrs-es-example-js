import { PrismaClient } from "@prisma/client";
import type { DynamoDBStreamEvent, Handler } from "aws-lambda";
import { GroupChatDao, ReadModelUpdater } from "cqrs-es-example-js-rmu";

let prisma: PrismaClient | undefined;
let readModelUpdater: ReadModelUpdater | undefined;

function getReadModelUpdater(): ReadModelUpdater {
  if (readModelUpdater) {
    return readModelUpdater;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  readModelUpdater = ReadModelUpdater.of(GroupChatDao.of(prisma));
  return readModelUpdater;
}

export const handler: Handler<DynamoDBStreamEvent, void> = async (event) => {
  await getReadModelUpdater().updateReadModel(event);
};
