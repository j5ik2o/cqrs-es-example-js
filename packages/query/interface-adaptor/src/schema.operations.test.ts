import { readFileSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { type ExecutionResult, type GraphQLSchema, graphql } from "graphql";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { createQuerySchema } from "./graphql/schema";

jest.setTimeout(180 * 1000);

const MIGRATIONS_DIR = join(__dirname, "../../../../tools/migrate/migrations");
const CREATED_AT = new Date("2026-11-07T07:18:08.000Z");
const NAIVE_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;

type Fixture = {
  groupChatId: string;
  otherGroupChatId: string;
  disabledGroupChatId: string;
  adminId: string;
  memberId: string;
  removedMemberId: string;
  outsiderId: string;
  messageId: string;
  disabledMessageId: string;
  otherMessageId: string;
};

const fixture: Fixture = {
  groupChatId: "GroupChat-main",
  otherGroupChatId: "GroupChat-other",
  disabledGroupChatId: "GroupChat-disabled",
  adminId: "UserAccount-admin",
  memberId: "UserAccount-member",
  removedMemberId: "UserAccount-removed",
  outsiderId: "UserAccount-outsider",
  messageId: "Message-main",
  disabledMessageId: "Message-disabled",
  otherMessageId: "Message-other",
};

let container: StartedTestContainer | undefined;
let prisma: PrismaClient | undefined;
let schema: GraphQLSchema | undefined;

beforeAll(async () => {
  container = await new GenericContainer("mysql:9.7")
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: "passwd",
      MYSQL_DATABASE: "ceer",
      MYSQL_USER: "ceer",
      MYSQL_PASSWORD: "ceer",
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage(/ready for connections/, 2))
    .start();
  const url = `mysql://ceer:ceer@localhost:${container.getMappedPort(
    3306,
  )}/ceer`;
  prisma = new PrismaClient({ datasources: { db: { url } } });
  await waitForMysql(prisma);
  for (const file of [
    "0_create_read_model_positions.up.sql",
    "1_create_group_chats.up.sql",
    "2_create_members.up.sql",
    "3_create_messages.up.sql",
  ]) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    await prisma.$executeRawUnsafe(sql);
  }
  await seedReadModel(prisma);
  schema = await createQuerySchema();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

async function seedReadModel(client: PrismaClient): Promise<void> {
  await client.groupChats.createMany({
    data: [
      {
        id: fixture.groupChatId,
        disabled: false,
        name: "group-chat",
        ownerId: fixture.adminId,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: fixture.otherGroupChatId,
        disabled: false,
        name: "other-group-chat",
        ownerId: fixture.outsiderId,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: fixture.disabledGroupChatId,
        disabled: true,
        name: "disabled-group-chat",
        ownerId: fixture.adminId,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
  });
  await client.members.createMany({
    data: [
      {
        id: "Member-admin",
        groupChatId: fixture.groupChatId,
        userAccountId: fixture.adminId,
        role: "administrator",
        disabled: false,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: "Member-member",
        groupChatId: fixture.groupChatId,
        userAccountId: fixture.memberId,
        role: "member",
        disabled: false,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: "Member-removed",
        groupChatId: fixture.groupChatId,
        userAccountId: fixture.removedMemberId,
        role: "member",
        disabled: true,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: "Member-outsider",
        groupChatId: fixture.otherGroupChatId,
        userAccountId: fixture.outsiderId,
        role: "administrator",
        disabled: false,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: "Member-disabled-group",
        groupChatId: fixture.disabledGroupChatId,
        userAccountId: fixture.adminId,
        role: "administrator",
        disabled: false,
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
  });
  await client.messages.createMany({
    data: [
      {
        id: fixture.messageId,
        disabled: false,
        groupChatId: fixture.groupChatId,
        userAccountId: fixture.memberId,
        text: "hello",
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: fixture.disabledMessageId,
        disabled: true,
        groupChatId: fixture.groupChatId,
        userAccountId: fixture.memberId,
        text: "deleted",
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
      {
        id: fixture.otherMessageId,
        disabled: false,
        groupChatId: fixture.otherGroupChatId,
        userAccountId: fixture.outsiderId,
        text: "secret",
        lastProcessedSequenceNumber: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
  });
}

async function execute(source: string): Promise<ExecutionResult> {
  if (prisma === undefined || schema === undefined) {
    throw new Error("read model test was not initialized");
  }
  return graphql({ schema, source, contextValue: { prisma } });
}

function query(field: string, args: string, selection: string): string {
  return `{ ${field}(${args}) { ${selection} } }`;
}

function asStringArgs(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(", ");
}

describe("Read API GraphQL operations", () => {
  test("getGroupChat returns the group chat to a member", async () => {
    const result = await execute(
      query(
        "getGroupChat",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.memberId,
        }),
        "id name ownerId createdAt updatedAt",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getGroupChat).toEqual({
      id: fixture.groupChatId,
      name: "group-chat",
      ownerId: fixture.adminId,
      createdAt: "2026-11-07T07:18:08",
      updatedAt: "2026-11-07T07:18:08",
    });
  });

  test("getGroupChat returns NaiveDateTime values without a timezone", async () => {
    const result = await execute(
      query(
        "getGroupChat",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.memberId,
        }),
        "createdAt",
      ),
    );
    const value = (result.data?.getGroupChat as { createdAt: string })
      .createdAt;
    expect(value).toMatch(NAIVE_DATE_TIME_PATTERN);
    expect(value).not.toContain("Z");
  });

  test("getGroupChat rejects a non-member", async () => {
    const result = await execute(
      query(
        "getGroupChat",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.outsiderId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getGroupChat rejects a removed member", async () => {
    const result = await execute(
      query(
        "getGroupChat",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.removedMemberId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getGroupChat hides a disabled group chat", async () => {
    const result = await execute(
      query(
        "getGroupChat",
        asStringArgs({
          groupChatId: fixture.disabledGroupChatId,
          userAccountId: fixture.adminId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getGroupChats only lists chats the account belongs to", async () => {
    const memberResult = await execute(
      query(
        "getGroupChats",
        asStringArgs({ userAccountId: fixture.memberId }),
        "id",
      ),
    );
    expect(memberResult.errors).toBeUndefined();
    expect(memberResult.data?.getGroupChats).toEqual([
      { id: fixture.groupChatId },
    ]);

    const outsiderResult = await execute(
      query(
        "getGroupChats",
        asStringArgs({ userAccountId: fixture.outsiderId }),
        "id",
      ),
    );
    expect(outsiderResult.errors).toBeUndefined();
    expect(outsiderResult.data?.getGroupChats).toEqual([
      { id: fixture.otherGroupChatId },
    ]);
  });

  test("getMember returns the requested member", async () => {
    const result = await execute(
      query(
        "getMember",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.memberId,
        }),
        "id groupChatId userAccountId role createdAt updatedAt",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMember).toEqual({
      id: "Member-member",
      groupChatId: fixture.groupChatId,
      userAccountId: fixture.memberId,
      role: "member",
      createdAt: "2026-11-07T07:18:08",
      updatedAt: "2026-11-07T07:18:08",
    });
  });

  test("getMembers returns active members to a member", async () => {
    const result = await execute(
      query(
        "getMembers",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.memberId,
        }),
        "userAccountId role",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMembers).toEqual([
      { userAccountId: fixture.adminId, role: "administrator" },
      { userAccountId: fixture.memberId, role: "member" },
    ]);
  });

  test("getMembers hides members from a non-member", async () => {
    const result = await execute(
      query(
        "getMembers",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.outsiderId,
        }),
        "userAccountId",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMembers).toEqual([]);
  });

  test("getMessage returns the message to a member", async () => {
    const result = await execute(
      query(
        "getMessage",
        asStringArgs({
          messageId: fixture.messageId,
          userAccountId: fixture.memberId,
        }),
        "id groupChatId userAccountId text createdAt updatedAt",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMessage).toEqual({
      id: fixture.messageId,
      groupChatId: fixture.groupChatId,
      userAccountId: fixture.memberId,
      text: "hello",
      createdAt: "2026-11-07T07:18:08",
      updatedAt: "2026-11-07T07:18:08",
    });
  });

  test("getMessage hides a message from a non-member", async () => {
    const result = await execute(
      query(
        "getMessage",
        asStringArgs({
          messageId: fixture.messageId,
          userAccountId: fixture.outsiderId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getMessage hides a message of another chat", async () => {
    const result = await execute(
      query(
        "getMessage",
        asStringArgs({
          messageId: fixture.otherMessageId,
          userAccountId: fixture.memberId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getMessage hides a deleted message", async () => {
    const result = await execute(
      query(
        "getMessage",
        asStringArgs({
          messageId: fixture.disabledMessageId,
          userAccountId: fixture.memberId,
        }),
        "id",
      ),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].extensions.code).toEqual("404");
  });

  test("getMessages returns the chat messages to a member", async () => {
    const result = await execute(
      query(
        "getMessages",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.memberId,
        }),
        "id text",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMessages).toEqual([
      { id: fixture.messageId, text: "hello" },
    ]);
  });

  test("getMessages hides messages from a non-member", async () => {
    const result = await execute(
      query(
        "getMessages",
        asStringArgs({
          groupChatId: fixture.groupChatId,
          userAccountId: fixture.outsiderId,
        }),
        "id",
      ),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.getMessages).toEqual([]);
  });
});

async function waitForMysql(client: PrismaClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await client.$queryRawUnsafe("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await client.$disconnect().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`MySQL did not become ready: ${String(lastError)}`);
}
