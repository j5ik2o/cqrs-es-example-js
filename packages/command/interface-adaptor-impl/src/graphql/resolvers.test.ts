import "reflect-metadata";
import {
  GroupChat,
  GroupChatDeleted,
  GroupChatId,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessageDeleted,
  GroupChatMessageEdited,
  GroupChatMessagePosted,
  GroupChatName,
  GroupChatRenamed,
  Member,
  MemberId,
  Message,
  MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import type {
  GroupChatCommandProcessor,
  GroupChatWithEvent,
} from "cqrs-es-example-js-command-processor";
import { Result } from "event-store-adapter-js";
import { graphql, printSchema } from "graphql";
import { createCommandSchema } from "./schema";

type FakeProcessor = {
  processor: GroupChatCommandProcessor;
  groupChatId: string;
  adminId: string;
};

function fakeProcessor(): FakeProcessor {
  const id = GroupChatId.generate();
  const adminId = UserAccountId.generate();
  const [groupChat, created] = GroupChat.create(
    id,
    GroupChatName.of("name"),
    adminId,
  );
  const pair = (
    event:
      | typeof created
      | GroupChatRenamed
      | GroupChatMemberAdded
      | GroupChatMemberRemoved
      | GroupChatMessagePosted
      | GroupChatMessageEdited
      | GroupChatMessageDeleted
      | GroupChatDeleted,
  ): Promise<Result<GroupChatWithEvent, never>> =>
    Promise.resolve(Result.ok([groupChat, event] as const));

  return {
    groupChatId: id.asString(),
    adminId: adminId.asString(),
    processor: {
      createGroupChat: () => pair(created),
      deleteGroupChat: (_id, executorId) =>
        pair(GroupChatDeleted.of(executorId)),
      renameGroupChat: (_id, name, executorId) =>
        pair(GroupChatRenamed.of(name, executorId)),
      addMemberToGroupChat: (_id, userAccountId, role, executorId) =>
        pair(
          GroupChatMemberAdded.of(
            Member.of(MemberId.generate(), userAccountId, role),
            executorId,
          ),
        ),
      removeMemberFromGroupChat: (_id, userAccountId, executorId) =>
        pair(
          GroupChatMemberRemoved.of(
            Member.of(MemberId.generate(), userAccountId, "member"),
            executorId,
          ),
        ),
      postMessageToGroupChat: (_id, message, executorId) =>
        pair(GroupChatMessagePosted.of(message, executorId)),
      editMessageInGroupChat: (_id, message, executorId) =>
        pair(GroupChatMessageEdited.of(message, executorId)),
      deleteMessageFromGroupChat: (_id, messageId, executorId) =>
        pair(
          GroupChatMessageDeleted.of(
            Message.of(messageId, "deleted", executorId, new Date()),
            executorId,
          ),
        ),
    },
  };
}

let schemaPromise: ReturnType<typeof createCommandSchema> | undefined;

function commandSchema(): ReturnType<typeof createCommandSchema> {
  schemaPromise ??= createCommandSchema();
  return schemaPromise;
}

async function execute(
  fake: FakeProcessor,
  source: string,
  variableValues?: Record<string, unknown>,
) {
  const schema = await commandSchema();
  return graphql({
    schema,
    source,
    variableValues,
    contextValue: { groupChatCommandProcessor: fake.processor },
  });
}

describe("GroupChatCommandResolver", () => {
  test("exposes the eight write mutations, healthCheck and the Role enum", async () => {
    const schema = await commandSchema();
    const sdl = printSchema(schema);
    for (const mutation of [
      "createGroupChat",
      "deleteGroupChat",
      "renameGroupChat",
      "addMember",
      "removeMember",
      "postMessage",
      "editMessage",
      "deleteMessage",
    ]) {
      expect(sdl).toContain(mutation);
    }
    expect(sdl).toContain("healthCheck: String!");
    expect(sdl).toContain("enum Role");
    expect(sdl).toContain("MEMBER");
    expect(sdl).toContain("ADMIN");
  });

  test("healthCheck returns OK", async () => {
    const fake = fakeProcessor();
    const result = await execute(fake, "{ healthCheck }");
    expect(result.errors).toBeUndefined();
    expect(result.data?.healthCheck).toEqual("OK");
  });

  test("createGroupChat returns the aggregate id", async () => {
    const fake = fakeProcessor();
    const result = await execute(
      fake,
      "mutation($input: CreateGroupChatInput!) { createGroupChat(input: $input) { groupChatId } }",
      { input: { name: "name", executorId: fake.adminId } },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.createGroupChat).toEqual({
      groupChatId: fake.groupChatId,
    });
  });

  test("addMember accepts the Role enum", async () => {
    const fake = fakeProcessor();
    const result = await execute(
      fake,
      "mutation($input: AddMemberInput!) { addMember(input: $input) { groupChatId } }",
      {
        input: {
          groupChatId: fake.groupChatId,
          userAccountId: UserAccountId.generate().asString(),
          role: "MEMBER",
          executorId: fake.adminId,
        },
      },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.addMember).toEqual({
      groupChatId: fake.groupChatId,
    });
  });

  test("postMessage returns groupChatId and messageId", async () => {
    const fake = fakeProcessor();
    const result = await execute(
      fake,
      "mutation($input: PostMessageInput!) { postMessage(input: $input) { groupChatId messageId } }",
      {
        input: {
          groupChatId: fake.groupChatId,
          content: "hello",
          executorId: fake.adminId,
        },
      },
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.postMessage).toEqual({
      groupChatId: fake.groupChatId,
      messageId: expect.any(String),
    });
  });

  test("editMessage, renameGroupChat, removeMember and deleteMessage return the aggregate id", async () => {
    const fake = fakeProcessor();
    const messageId = MessageId.generate().asString();
    const userAccountId = UserAccountId.generate().asString();
    const cases = [
      {
        source:
          "mutation($input: EditMessageInput!) { editMessage(input: $input) { groupChatId } }",
        input: {
          groupChatId: fake.groupChatId,
          messageId,
          content: "edited",
          executorId: fake.adminId,
        },
        field: "editMessage",
      },
      {
        source:
          "mutation($input: RenameGroupChatInput!) { renameGroupChat(input: $input) { groupChatId } }",
        input: {
          groupChatId: fake.groupChatId,
          name: "renamed",
          executorId: fake.adminId,
        },
        field: "renameGroupChat",
      },
      {
        source:
          "mutation($input: RemoveMemberInput!) { removeMember(input: $input) { groupChatId } }",
        input: {
          groupChatId: fake.groupChatId,
          userAccountId,
          executorId: fake.adminId,
        },
        field: "removeMember",
      },
      {
        source:
          "mutation($input: DeleteMessageInput!) { deleteMessage(input: $input) { groupChatId } }",
        input: {
          groupChatId: fake.groupChatId,
          messageId,
          executorId: fake.adminId,
        },
        field: "deleteMessage",
      },
      {
        source:
          "mutation($input: DeleteGroupChatInput!) { deleteGroupChat(input: $input) { groupChatId } }",
        input: { groupChatId: fake.groupChatId, executorId: fake.adminId },
        field: "deleteGroupChat",
      },
    ];
    for (const testCase of cases) {
      const result = await execute(fake, testCase.source, {
        input: testCase.input,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.[testCase.field]).toEqual({
        groupChatId: fake.groupChatId,
      });
    }
  });

  test("rejects an invalid role at the schema boundary", async () => {
    const fake = fakeProcessor();
    const result = await execute(
      fake,
      "mutation($input: AddMemberInput!) { addMember(input: $input) { groupChatId } }",
      {
        input: {
          groupChatId: fake.groupChatId,
          userAccountId: UserAccountId.generate().asString(),
          role: "OWNER",
          executorId: fake.adminId,
        },
      },
    );
    expect(result.errors).toBeDefined();
  });
});
