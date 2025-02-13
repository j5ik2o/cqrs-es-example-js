import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { PrismaClient } from "@prisma/client";
import { createQuerySchema } from "cqrs-es-example-js-query-interface-adaptor";
import type { QueryContext } from "cqrs-es-example-js-query-interface-adaptor";
import { logger } from "./index";
import type { PrismaQueryEvent } from "./types";

interface MyContext {
  prisma: PrismaClient;
}

async function readApiMain() {
  const apiHost =
    process.env.API_HOST !== undefined ? process.env.API_HOST : "localhost";
  const apiPort =
    process.env.API_PORT !== undefined
      ? Number.parseInt(process.env.API_PORT)
      : 3000;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  logger.info(`API_HOST: ${apiHost}`);
  logger.info(`API_PORT: ${apiPort}`);
  logger.info(`DATABASE_URL: ${databaseUrl}`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: [{ level: "query", emit: "event" }],
  });
  prisma.$on("query", async (e: PrismaQueryEvent) => {
    logger.info(`Query: ${e.query}`);
    logger.info(`Params: ${e.params}`);
    logger.info(`Duration: ${e.duration}ms`);
  });

  const schema = await createQuerySchema();
  const server = new ApolloServer<QueryContext>({ schema });
  const { url } = await startStandaloneServer(server, {
    context: async (): Promise<MyContext> => ({ prisma }),
    listen: { host: apiHost, port: apiPort },
  });
  logger.info(`🚀 Server ready at ${url}`);
}

export { readApiMain };
