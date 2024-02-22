import { createSchema } from "cqrs-es-example-js-query-interface-adaptor";
import { PrismaClient } from "@prisma/client";
// import { ApolloServer } from "apollo-server";
import { logger } from "./index";
import express from "express";
import { createYoga } from "graphql-yoga";

async function readApiMain() {
  const apiHost =
    process.env.API_HOST !== undefined ? process.env.API_HOST : "localhost";
  const apiPort =
    process.env.API_PORT !== undefined ? parseInt(process.env.API_PORT) : 3000;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  logger.info(`API_HOST: ${apiHost}`);
  logger.info(`API_PORT: ${apiPort}`);
  logger.info(`DATABASE_URL: ${DATABASE_URL}`);

  const prisma = new PrismaClient();
  const schema = await createSchema();

  const readApiServer = express();

  const yoga = createYoga({
    graphqlEndpoint: "/",
    fetchAPI: {
      fetch,
      Request,
      ReadableStream,
      Response,
    },
    schema,
    context: () => ({ prisma }),
  });

  readApiServer.use(yoga.graphqlEndpoint, yoga);

  readApiServer.listen(apiPort, () => {
    logger.info(`Server started on ${apiHost}:${apiPort}`);
  });

  // serve(
  //   { fetch: readApiServer.fetch, hostname: apiHost, port: apiPort },
  //   (addressInfo) => {
  //     logger.info(
  //       `Server started on ${addressInfo.address}:${addressInfo.port}`,
  //     );
  //   },
  // );
}

export { readApiMain };
