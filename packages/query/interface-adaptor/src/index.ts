import path from "node:path";
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

async function createSchema(): Promise<GraphQLSchema> {
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
    emitSchemaFile: path.resolve(__dirname, "schema.graphql"),
    validate: false,
  });
}

export { createSchema };
