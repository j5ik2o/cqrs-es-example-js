import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AttributeValue, DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import { ReadModelUpdater } from "./update-read-model";

const MIGRATIONS_DIR = join(__dirname, "../../../tools/migrate/migrations");

type PayloadEncoding = "raw" | "base64" | "bytes";

function wirePayload(event: GroupChatEvent): string {
  return JSON.stringify({ type: event.typeName, data: event });
}

function encodePayload(json: string, encoding: PayloadEncoding): string {
  if (encoding === "base64") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  if (encoding === "bytes") {
    return Array.from(Buffer.from(json, "utf-8")).join(",");
  }
  return json;
}

function headEventAttribute(
  event: GroupChatEvent,
  encoding: PayloadEncoding,
): AttributeValue {
  return {
    M: {
      seq_nr: { N: String(event.sequenceNumber) },
      occurred_at: {
        N: String(BigInt(event.occurredAt.getTime()) * BigInt(1_000_000)),
      },
      manifest: { S: event.typeName },
      payload: { B: encodePayload(wirePayload(event), encoding) },
    },
  };
}

function asHeadStreamEvent(
  eventName: "INSERT" | "MODIFY" | "REMOVE",
  aggregateId: string,
  events: readonly GroupChatEvent[],
  encoding: PayloadEncoding = "raw",
): DynamoDBStreamEvent {
  const records = [
    {
      eventName,
      dynamodb: {
        ApproximateCreationDateTime: 1_780_000_000_000,
        SequenceNumber: "1",
        NewImage: {
          aid: { S: aggregateId },
          type_name: { S: "GroupChat" },
          seq_nr: {
            N: String(events[events.length - 1]?.sequenceNumber ?? 0),
          },
          events: {
            L: events.map((event) => headEventAttribute(event, encoding)),
          },
        },
      },
    },
  ];
  return { Records: records } as unknown as DynamoDBStreamEvent;
}

class FakeJournalReader implements JournalReader {
  readonly calls: {
    aggregateId: string;
    fromSeqNr: number;
    toSeqNr: number;
  }[] = [];

  constructor(private readonly events: readonly JournalEvent[]) {}

  async readEvents(
    aggregateId: string,
    fromSeqNr: number,
    toSeqNr: number,
  ): Promise<JournalEvent[]> {
    this.calls.push({ aggregateId, fromSeqNr, toSeqNr });
    return this.events.filter(
      (event) =>
        event.aggregateId === aggregateId &&
        event.seqNr >= fromSeqNr &&
        event.seqNr <= toSeqNr,
    );
  }
}

function journalEvent(event: GroupChatEvent): JournalEvent {
  return {
    aggregateId: event.aggregateId.asString(),
    seqNr: event.sequenceNumber,
    occurredAt: event.occurredAt,
    manifest: event.typeName,
    payload: new TextEncoder().encode(wirePayload(event)),
    event,
  };
}

describe("ReadModelUpdater (DynamoDB head stream -> MySQL)", () => {
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
    "projects INSERT and MODIFY head records into MySQL",
    async () => {
      const db = requirePrisma(prisma);
      const updater = updaterOf(db, new FakeJournalReader([]));
      const fixture = newFixture();

      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", fixture.aggregateId, [fixture.created]),
      );
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [fixture.memberAdded]),
      );

      const groupChat = await db.groupChats.findUnique({
        where: { id: fixture.aggregateId },
      });
      expect(groupChat?.name).toEqual("name");
      expect(groupChat?.ownerId).toEqual(fixture.adminId.asString());
      // The created_at must be a sane date (regression: a millis stream
      // timestamp was multiplied by 1000 into the year 58379).
      const year = groupChat?.createdAt.getUTCFullYear() ?? 0;
      expect(year).toBeGreaterThanOrEqual(2020);
      expect(year).toBeLessThanOrEqual(2100);

      const members = await db.members.findMany({
        where: { groupChatId: fixture.aggregateId },
      });
      expect(members.length).toEqual(2);
      expect(await positionOf(db, fixture.aggregateId)).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "drops duplicate and stale head events",
    async () => {
      const db = requirePrisma(prisma);
      const updater = updaterOf(db, new FakeJournalReader([]));
      const fixture = newFixture();
      const batch = [fixture.created, fixture.memberAdded, fixture.renamed];

      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", fixture.aggregateId, batch),
      );
      // Replaying the same head record simulates a duplicate delivery.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, batch),
      );
      // A stale record that arrives after a newer one must be dropped.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [fixture.created]),
      );

      expect(await positionOf(db, fixture.aggregateId)).toEqual(3);
      const groupChat = await db.groupChats.findUnique({
        where: { id: fixture.aggregateId },
      });
      expect(groupChat?.name).toEqual("renamed");
      const members = await db.members.findMany({
        where: { groupChatId: fixture.aggregateId },
      });
      expect(members.length).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "fills a sequence gap from the journal",
    async () => {
      const db = requirePrisma(prisma);
      const fixture = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(fixture.created),
        journalEvent(fixture.memberAdded),
        journalEvent(fixture.renamed),
      ]);
      const updater = updaterOf(db, journal);

      // The head record for seq_nr 3 arrives without 1 and 2.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [fixture.renamed]),
      );

      expect(await positionOf(db, fixture.aggregateId)).toEqual(3);
      const groupChat = await db.groupChats.findUnique({
        where: { id: fixture.aggregateId },
      });
      expect(groupChat?.name).toEqual("renamed");
      const members = await db.members.findMany({
        where: { groupChatId: fixture.aggregateId },
      });
      expect(members.length).toEqual(2);
      expect(journal.calls).toEqual([
        { aggregateId: fixture.aggregateId, fromSeqNr: 1, toSeqNr: 2 },
      ]);
    },
    TIMEOUT,
  );

  test(
    "applies out-of-order head events without duplicating",
    async () => {
      const db = requirePrisma(prisma);
      const fixture = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(fixture.created),
        journalEvent(fixture.memberAdded),
        journalEvent(fixture.renamed),
      ]);
      const updater = updaterOf(db, journal);

      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [fixture.renamed]),
      );
      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", fixture.aggregateId, [fixture.created]),
      );

      expect(await positionOf(db, fixture.aggregateId)).toEqual(3);
      expect(
        await db.groupChats.count({ where: { id: fixture.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({
          where: { groupChatId: fixture.aggregateId },
        }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "commits the events before a failing record and keeps its position",
    async () => {
      const db = requirePrisma(prisma);
      const fixture = newFixture();
      // The journal has no seq_nr 2, so the head record for seq_nr 3 fails
      // after the seq_nr 1 record has committed.
      const updater = updaterOf(
        db,
        new FakeJournalReader([journalEvent(fixture.created)]),
      );

      await expect(
        updater.updateFromHeadStream(
          asHeadStreamEvent("MODIFY", fixture.aggregateId, [
            fixture.created,
            fixture.renamed,
          ]),
        ),
      ).rejects.toThrow("Journal is missing seq_nr 2..2");

      expect(await positionOf(db, fixture.aggregateId)).toEqual(1);
      expect(
        await db.groupChats.count({ where: { id: fixture.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({
          where: { groupChatId: fixture.aggregateId },
        }),
      ).toEqual(1);

      // Retrying the failed position with the now-available event succeeds.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [fixture.memberAdded]),
      );
      expect(await positionOf(db, fixture.aggregateId)).toEqual(2);
      expect(
        await db.members.count({
          where: { groupChatId: fixture.aggregateId },
        }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "resumes from the committed position after a restart",
    async () => {
      const db = requirePrisma(prisma);
      const fixture = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(fixture.created),
        journalEvent(fixture.memberAdded),
      ]);

      const first = updaterOf(db, journal);
      await first.updateFromHeadStream(
        asHeadStreamEvent("INSERT", fixture.aggregateId, [fixture.created]),
      );

      // A new process starts from the beginning of the retained stream.
      const restarted = updaterOf(db, journal);
      await restarted.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", fixture.aggregateId, [
          fixture.created,
          fixture.memberAdded,
        ]),
      );

      expect(await positionOf(db, fixture.aggregateId)).toEqual(2);
      expect(
        await db.groupChats.count({ where: { id: fixture.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({
          where: { groupChatId: fixture.aggregateId },
        }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "ignores __config__, other aggregate types and REMOVE records",
    async () => {
      const db = requirePrisma(prisma);
      const updater = updaterOf(db, new FakeJournalReader([]));
      const fixture = newFixture();
      const groupChatsBefore = await db.groupChats.count();
      const positionsBefore = await db.readModelPositions.count();
      const config = asHeadStreamEvent("INSERT", "__config__", [
        fixture.created,
      ]);
      const foreign = asHeadStreamEvent(
        "INSERT",
        "UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z",
        [fixture.created],
      );
      const removed = asHeadStreamEvent("REMOVE", fixture.aggregateId, [
        fixture.created,
      ]);
      removed.Records[0].dynamodb = undefined;

      await updater.updateFromHeadStream({
        Records: [...config.Records, ...foreign.Records, ...removed.Records],
      } as unknown as DynamoDBStreamEvent);

      expect(await db.groupChats.count()).toEqual(groupChatsBefore);
      expect(await db.readModelPositions.count()).toEqual(positionsBefore);
    },
    TIMEOUT,
  );
});

function requirePrisma(prisma: PrismaClient | undefined): PrismaClient {
  if (prisma === undefined) {
    throw new Error("prisma not initialized");
  }
  return prisma;
}

function updaterOf(
  prisma: PrismaClient,
  journal: JournalReader,
): ReadModelUpdater {
  return ReadModelUpdater.create(GroupChatDao.create(prisma), journal);
}

async function positionOf(
  prisma: PrismaClient,
  aggregateId: string,
): Promise<number> {
  const position = await prisma.readModelPositions.findUnique({
    where: { aggregateId },
  });
  return position?.lastProcessedSequenceNumber ?? 0;
}

type Fixture = {
  aggregateId: string;
  adminId: UserAccountId;
  created: GroupChatEvent;
  memberAdded: GroupChatEvent;
  renamed: GroupChatEvent;
};

function newFixture(): Fixture {
  const id = GroupChatId.generate();
  const adminId = UserAccountId.generate();
  const [gc0, created] = GroupChat.create(
    id,
    GroupChatName.of("name"),
    adminId,
  );
  const memberId = UserAccountId.generate();
  const [gc1, memberAdded] = unwrap(gc0.addMember(memberId, "member", adminId));
  const [, renamed] = unwrap(gc1.rename(GroupChatName.of("renamed"), adminId));
  return {
    aggregateId: id.asString(),
    adminId,
    created,
    memberAdded,
    renamed,
  };
}

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
