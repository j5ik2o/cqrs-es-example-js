import {createSchema} from "cqrs-es-example-js-query-interface-adaptor";
import { PrismaClient } from "@prisma/client";
import {ApolloServer} from "apollo-server";

interface Context {
    prisma: PrismaClient;
}
async function readApiMain() {
    const prisma = new PrismaClient();
    const schema = await createSchema();
    const server = new ApolloServer({ schema, context: (): Context => ({ prisma })});
    const { port } = await server.listen(4000);
    console.log(`GraphQL server ready at ${port}`);
}

export { readApiMain }
