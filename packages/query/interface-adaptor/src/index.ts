import {
  FindFirstGroupChatsOrThrowResolver,
  FindFirstGroupChatsResolver,
  FindManyGroupChatsResolver,
  FindUniqueGroupChatsOrThrowResolver,
  FindUniqueGroupChatsResolver,
  GroupByGroupChatsResolver,
  FindFirstMembersOrThrowResolver,
  FindFirstMembersResolver,
  FindManyMembersResolver,
  FindUniqueMembersOrThrowResolver,
  FindUniqueMembersResolver,
  GroupByMembersResolver,
  FindFirstMessagesOrThrowResolver,
  FindFirstMessagesResolver,
  FindManyMessagesResolver,
  FindUniqueMessagesOrThrowResolver,
  FindUniqueMessagesResolver,
  GroupByMessagesResolver,
  GroupChatsRelationsResolver,
  MembersRelationsResolver,
  MessagesRelationsResolver,
} from "@generated/type-graphql";
import { buildSchema } from "type-graphql";
import { GraphQLSchema } from "graphql/type";

async function createQuerySchema(): Promise<GraphQLSchema> {
  return await buildSchema({
    resolvers: [
      FindFirstGroupChatsOrThrowResolver,
      FindFirstGroupChatsResolver,
      FindManyGroupChatsResolver,
      FindUniqueGroupChatsOrThrowResolver,
      FindUniqueGroupChatsResolver,
      GroupByGroupChatsResolver,
      FindFirstMembersOrThrowResolver,
      FindFirstMembersResolver,
      FindManyMembersResolver,
      FindUniqueMembersOrThrowResolver,
      FindUniqueMembersResolver,
      GroupByMembersResolver,
      FindFirstMessagesOrThrowResolver,
      FindFirstMessagesResolver,
      FindManyMessagesResolver,
      FindUniqueMessagesOrThrowResolver,
      FindUniqueMessagesResolver,
      GroupByMessagesResolver,
      GroupChatsRelationsResolver,
      MembersRelationsResolver,
      MessagesRelationsResolver,
    ],
    // emitSchemaFile: path.resolve(__dirname, "query.schema.graphql"),
    validate: false,
  });
}

export { createQuerySchema };
