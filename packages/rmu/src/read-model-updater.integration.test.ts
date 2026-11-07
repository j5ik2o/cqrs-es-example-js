import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  GroupChatEvent,
  type GroupChatEvent as GroupChatEventType,
  GroupChatId,
  GroupChatName,
  Message,
  MessageId,
  UserAccountId,
  manifestOf,
} from "cqrs-es-example-js-command-domain";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { GroupChatDao } from "./group-chat-dao";
import { ReadModelUpdater } from "./update-read-model";

const MIGRATIONS_DIR = join(__dirname, "../../../tools/migrate/migrations");

// Serialize an event the way the v5 event store does: the journal item carries
// the envelope metadata and the B field holds the pure domain JSON payload.
type PayloadEncoding = "raw" | "base64" | "bytes";

function encodePayload(json: string, encoding: PayloadEncoding): string {
  if (encoding === "base64") {
    // Real AWS Lambda delivers Binary (B) attributes base64-encoded.
    return Buffer.from(json, "utf-8").toString("base64");
  }
  if (encoding === "bytes") {
    // dynamodb-local-rmu delivers B as a comma-separated byte string (Uint8Array.toString()).
    return Array.from(Buffer.from(json, "utf-8")).join(",");
  }
  // LocalStack delivers B as a raw JSON string.
  return json;
}

function asDynamoDBStreamEvent(
  event: GroupChatEventType,
  aggregateId: string,
  sequenceNumber: number,
  occurredAt: Date,
  encoding: PayloadEncoding = "raw",
): DynamoDBStreamEvent {
  const payload = encodePayload(
    JSON.stringify(GroupChatEvent.toJSON(event)),
    encoding,
  );
  const nanos = (BigInt(occurredAt.getTime()) * BigInt(1_000_000)).toString();
  return {
    Records: [
      {
        eventName: "INSERT",
        dynamodb: {
          // LocalStack / dynamodb-local-rmu deliver this in epoch MILLISECONDS.
          ApproximateCreationDateTime: 1_780_000_000_000,
          NewImage: {
            aid: { S: aggregateId },
            seq_nr: { N: String(sequenceNumber) },
            occurred_at: { N: nanos },
            manifest: { S: manifestOf(event.typeName) },
            payload: { B: payload },
          },
          SequenceNumber: "1",
        },
      },
    ],
  } as unknown as DynamoDBStreamEvent;
}

describe("ReadModelUpdater (DynamoDB stream -> MySQL)", () => {
  const TIMEOUT = 120 * 1000;
  let container: StartedTestContainer | undefined;
  let prisma: PrismaClient | undefined;

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
    // MySQL's entrypoint restarts the server after init; retry until the real
    // server accepts connections before running migrations.
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
  }, TIMEOUT);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  }, TIMEOUT);

  test(
    "projects GroupChatCreated, MemberAdded and MessagePosted into MySQL",
    async () => {
      if (prisma === undefined) {
        throw new Error("prisma not initialized");
      }
      const updater = ReadModelUpdater.create(GroupChatDao.create(prisma));

      const id = GroupChatId.generate();
      const adminId = UserAccountId.generate();
      const occurredAt = new Date();
      const [gc0, created] = GroupChat.create(
        id,
        GroupChatName.of("name"),
        adminId,
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          created,
          id.asString(),
          gc0.sequenceNumber,
          occurredAt,
        ),
      );

      const memberId = UserAccountId.generate();
      const [gc1, memberAdded] = unwrap(
        gc0.addMember(memberId, "member", adminId),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          memberAdded,
          id.asString(),
          gc1.sequenceNumber,
          occurredAt,
        ),
      );

      const message = Message.of(
        MessageId.generate(),
        "hello",
        memberId,
        occurredAt,
      );
      const [gc2, messagePosted] = unwrap(gc1.postMessage(message, memberId));
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          messagePosted,
          id.asString(),
          gc2.sequenceNumber,
          occurredAt,
        ),
      );

      const editedMessage = Message.of(
        message.id,
        "edited",
        memberId,
        occurredAt,
      );
      const [gc3, messageEdited] = unwrap(
        gc2.editMessage(editedMessage, memberId),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          messageEdited,
          id.asString(),
          gc3.sequenceNumber,
          occurredAt,
        ),
      );

      const groupChat = await prisma.groupChats.findUnique({
        where: { id: id.asString() },
      });
      expect(groupChat?.name).toEqual("name");
      expect(groupChat?.ownerId).toEqual(adminId.asString());
      // The created_at must be a sane date (regression: a millis stream
      // timestamp was multiplied by 1000 into the year 58379).
      const year = groupChat?.createdAt.getUTCFullYear() ?? 0;
      expect(year).toBeGreaterThanOrEqual(2020);
      expect(year).toBeLessThanOrEqual(2100);

      const members = await prisma.members.findMany({
        where: { groupChatId: id.asString() },
      });
      // admin (from GroupChatCreated) + added member
      expect(members.length).toEqual(2);

      const storedMessage = await prisma.messages.findUnique({
        where: { id: message.id.asString() },
      });
      expect(storedMessage?.text).toEqual("edited");

      // Idempotency: replaying the same events must not error or duplicate.
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          created,
          id.asString(),
          gc0.sequenceNumber,
          occurredAt,
        ),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          memberAdded,
          id.asString(),
          gc1.sequenceNumber,
          occurredAt,
        ),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          messagePosted,
          id.asString(),
          gc2.sequenceNumber,
          occurredAt,
        ),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          messageEdited,
          id.asString(),
          gc3.sequenceNumber,
          occurredAt,
        ),
      );
      const membersAfter = await prisma.members.findMany({
        where: { groupChatId: id.asString() },
      });
      expect(membersAfter.length).toEqual(2);
      const messageAfter = await prisma.messages.findUnique({
        where: { id: message.id.asString() },
      });
      expect(messageAfter?.text).toEqual("edited");
    },
    TIMEOUT,
  );

  test(
    "decodes every stream payload encoding (raw / base64 / bytes)",
    async () => {
      if (prisma === undefined) {
        throw new Error("prisma not initialized");
      }
      const updater = ReadModelUpdater.create(GroupChatDao.create(prisma));
      const encodings: ("raw" | "base64" | "bytes")[] = [
        "raw",
        "base64",
        "bytes",
      ];
      for (const encoding of encodings) {
        const id = GroupChatId.generate();
        const adminId = UserAccountId.generate();
        const [groupChat, created] = GroupChat.create(
          id,
          GroupChatName.of(`gc-${encoding}`),
          adminId,
        );
        await updater.updateFromDynamoDBStream(
          asDynamoDBStreamEvent(
            created,
            id.asString(),
            groupChat.sequenceNumber,
            new Date(),
            encoding,
          ),
        );
        const row = await prisma.groupChats.findUnique({
          where: { id: id.asString() },
        });
        expect(row?.name).toEqual(`gc-${encoding}`);
      }
    },
    TIMEOUT,
  );

  test(
    "rejects sequence gaps and applies the retried event after the missing event",
    async () => {
      if (prisma === undefined) {
        throw new Error("prisma not initialized");
      }
      const updater = ReadModelUpdater.create(GroupChatDao.create(prisma));

      const id = GroupChatId.generate();
      const adminId = UserAccountId.generate();
      const [gc0, created] = GroupChat.create(
        id,
        GroupChatName.of("before"),
        adminId,
      );
      const memberId = UserAccountId.generate();
      const [gc1, memberAdded] = unwrap(
        gc0.addMember(memberId, "member", adminId),
      );
      const [gc2, renamed] = unwrap(
        gc1.rename(GroupChatName.of("after"), adminId),
      );
      const occurredAt = new Date();

      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          created,
          id.asString(),
          gc0.sequenceNumber,
          occurredAt,
        ),
      );
      await expect(
        updater.updateFromDynamoDBStream(
          asDynamoDBStreamEvent(
            renamed,
            id.asString(),
            gc2.sequenceNumber,
            occurredAt,
          ),
        ),
      ).rejects.toThrow("Read model projection gap");
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          memberAdded,
          id.asString(),
          gc1.sequenceNumber,
          occurredAt,
        ),
      );
      await updater.updateFromDynamoDBStream(
        asDynamoDBStreamEvent(
          renamed,
          id.asString(),
          gc2.sequenceNumber,
          occurredAt,
        ),
      );

      const groupChat = await prisma.groupChats.findUnique({
        where: { id: id.asString() },
      });
      expect(groupChat?.name).toEqual("after");
    },
    TIMEOUT,
  );
});

function unwrap<E extends { message: string }, Ev extends GroupChatEvent>(
  result: { type: "ok"; value: [GroupChat, Ev] } | { type: "err"; error: E },
): [GroupChat, Ev] {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}

async function waitForMysql(prisma: PrismaClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await prisma.$disconnect().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`MySQL did not become ready: ${String(lastError)}`);
}
