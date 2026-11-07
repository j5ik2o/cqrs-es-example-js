import "reflect-metadata";
import { printSchema } from "graphql";
import { createQuerySchema } from "./graphql/schema";

describe("createQuerySchema", () => {
  test("exposes the six read queries with the v5 type names", async () => {
    const schema = await createQuerySchema();
    const sdl = printSchema(schema);

    expect(sdl).toContain("scalar NaiveDateTime");
    expect(sdl).toContain("type GroupChat {");
    expect(sdl).toContain("type Member {");
    expect(sdl).toContain("type Message {");
    expect(sdl).not.toContain("Output");

    expect(sdl).toContain(
      "getGroupChat(userAccountId: String!, groupChatId: String!): GroupChat!",
    );
    expect(sdl).toContain(
      "getGroupChats(userAccountId: String!): [GroupChat!]!",
    );
    expect(sdl).toContain(
      "getMember(userAccountId: String!, groupChatId: String!): Member!",
    );
    expect(sdl).toContain(
      "getMembers(userAccountId: String!, groupChatId: String!): [Member!]!",
    );
    expect(sdl).toContain(
      "getMessage(userAccountId: String!, messageId: String!): Message!",
    );
    expect(sdl).toContain(
      "getMessages(userAccountId: String!, groupChatId: String!): [Message!]!",
    );
  });

  test("uses NaiveDateTime for every timestamp", async () => {
    const schema = await createQuerySchema();
    const sdl = printSchema(schema);

    expect(sdl).not.toMatch(/createdAt: Date!/);
    expect(sdl.match(/createdAt: NaiveDateTime!/g)).toHaveLength(3);
    expect(sdl.match(/updatedAt: NaiveDateTime!/g)).toHaveLength(3);
  });
});
