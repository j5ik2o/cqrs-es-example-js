import { GraphQLSchema } from "graphql/type";
import { buildSchema } from "type-graphql";
import { GroupChatResolver } from "./resolvers";

async function createCommandSchema(): Promise<GraphQLSchema> {
  return await buildSchema({
    resolvers: [GroupChatResolver],
    // emitSchemaFile: path.resolve(__dirname, "command.schema.graphql"),
    validate: false,
  });
}

export { createCommandSchema };
