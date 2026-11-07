import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AttributeValue, DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { DeadLetterStore } from "./dead-letter-store";
import { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import { DeadLetterRecovery } from "./recovery";
import { ReadModelUpdater } from "./update-read-model";

const MIGRATIONS_DIR = join(__dirname, "../../../tools/migrate/migrations");

type PayloadEncoding = "raw" | "base64" | "bytes";

type HeadFixture = {
  event: GroupChatEvent;
  seqNr: number;
  occurredAt: Date;
};

function fixture(event: GroupChatEvent, seqNr: number): HeadFixture {
  return {
    event,
    seqNr,
    occurredAt: new Date(1_700_000_000_000 + seqNr * 1_000),
  };
}

// ESA v5 serializes only the domain payload; metadata lives in the head event
// envelope, so the fixture supplies seq_nr/occurred_at separately.
function wirePayload(event: GroupChatEvent): string {
  return JSON.stringify(GroupChatEvent.toJSON(event));
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
  headEvent: HeadFixture,
  encoding: PayloadEncoding,
): AttributeValue {
  return {
    M: {
      seq_nr: { N: String(headEvent.seqNr) },
      occurred_at: {
        N: String(BigInt(headEvent.occurredAt.getTime()) * BigInt(1_000_000)),
      },
      manifest: { S: `${headEvent.event.typeName}@1` },
      payload: { B: encodePayload(wirePayload(headEvent.event), encoding) },
    },
  };
}

function asHeadStreamEvent(
  eventName: "INSERT" | "MODIFY" | "REMOVE",
  aggregateId: string,
  events: readonly HeadFixture[],
  encoding: PayloadEncoding = "raw",
): DynamoDBStreamEvent {
  const last = events[events.length - 1];
  const records = [
    {
      eventName,
      dynamodb: {
        ApproximateCreationDateTime: 1_780_000_000_000,
        SequenceNumber: "1",
        NewImage: {
          aid: { S: aggregateId },
          type_name: { S: "GroupChat" },
          seq_nr: { N: String(last?.seqNr ?? 0) },
          events: {
            L: events.map((headEvent) =>
              headEventAttribute(headEvent, encoding),
            ),
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

function journalEvent(
  aggregateId: string,
  headEvent: HeadFixture,
): JournalEvent {
  return {
    aggregateId,
    seqNr: headEvent.seqNr,
    occurredAt: headEvent.occurredAt,
    manifest: `${headEvent.event.typeName}@1`,
    payload: new TextEncoder().encode(wirePayload(headEvent.event)),
    event: headEvent.event,
  };
}

describe("ReadModelUpdater (DynamoDB head stream -> MySQL)", () => {
  const TIMEOUT = 120 * 1000;
  let container: StartedTestContainer | undefined;
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    container = await new GenericContainer("mysql:9.7")
      .withCommand([
        "--innodb-buffer-pool-size=64M",
        "--performance-schema=OFF",
      ])
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
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".up.sql"))
      .sort();
    for (const file of migrations) {
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
      const f = newFixture();

      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", f.aggregateId, [f.created]),
      );
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.memberAdded]),
      );

      const groupChat = await db.groupChats.findUnique({
        where: { id: f.aggregateId },
      });
      expect(groupChat?.name).toEqual("name");
      expect(groupChat?.ownerId).toEqual(f.adminId.asString());
      // The created_at must be a sane date (regression: a millis stream
      // timestamp was multiplied by 1000 into the year 58379).
      const year = groupChat?.createdAt.getUTCFullYear() ?? 0;
      expect(year).toBeGreaterThanOrEqual(2020);
      expect(year).toBeLessThanOrEqual(2100);

      const members = await db.members.findMany({
        where: { groupChatId: f.aggregateId },
      });
      expect(members.length).toEqual(2);
      expect(await positionOf(db, f.aggregateId)).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "drops duplicate and stale head events",
    async () => {
      const db = requirePrisma(prisma);
      const updater = updaterOf(db, new FakeJournalReader([]));
      const f = newFixture();
      const batch = [f.created, f.memberAdded, f.renamed];

      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", f.aggregateId, batch),
      );
      // Replaying the same head record simulates a duplicate delivery.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, batch),
      );
      // A stale record that arrives after a newer one must be dropped.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.created]),
      );

      expect(await positionOf(db, f.aggregateId)).toEqual(3);
      const groupChat = await db.groupChats.findUnique({
        where: { id: f.aggregateId },
      });
      expect(groupChat?.name).toEqual("renamed");
      const members = await db.members.findMany({
        where: { groupChatId: f.aggregateId },
      });
      expect(members.length).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "fills a sequence gap from the journal",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(f.aggregateId, f.created),
        journalEvent(f.aggregateId, f.memberAdded),
        journalEvent(f.aggregateId, f.renamed),
      ]);
      const updater = updaterOf(db, journal);

      // The head record for seq_nr 3 arrives without 1 and 2.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.renamed]),
      );

      expect(await positionOf(db, f.aggregateId)).toEqual(3);
      const groupChat = await db.groupChats.findUnique({
        where: { id: f.aggregateId },
      });
      expect(groupChat?.name).toEqual("renamed");
      const members = await db.members.findMany({
        where: { groupChatId: f.aggregateId },
      });
      expect(members.length).toEqual(2);
      expect(journal.calls).toEqual([
        { aggregateId: f.aggregateId, fromSeqNr: 1, toSeqNr: 2 },
      ]);
    },
    TIMEOUT,
  );

  test(
    "applies out-of-order head events without duplicating",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(f.aggregateId, f.created),
        journalEvent(f.aggregateId, f.memberAdded),
        journalEvent(f.aggregateId, f.renamed),
      ]);
      const updater = updaterOf(db, journal);

      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.renamed]),
      );
      await updater.updateFromHeadStream(
        asHeadStreamEvent("INSERT", f.aggregateId, [f.created]),
      );

      expect(await positionOf(db, f.aggregateId)).toEqual(3);
      expect(
        await db.groupChats.count({ where: { id: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "commits the events before a failing record and keeps its position",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      // The journal has no seq_nr 2, so the head record for seq_nr 3 fails
      // after the seq_nr 1 record has committed.
      const updater = updaterOf(
        db,
        new FakeJournalReader([journalEvent(f.aggregateId, f.created)]),
      );

      await expect(
        updater.updateFromHeadStream(
          asHeadStreamEvent("MODIFY", f.aggregateId, [f.created, f.renamed]),
        ),
      ).rejects.toThrow("Journal is missing seq_nr 2..2");

      expect(await positionOf(db, f.aggregateId)).toEqual(1);
      expect(
        await db.groupChats.count({ where: { id: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(1);

      // Retrying the failed position with the now-available event succeeds.
      await updater.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.memberAdded]),
      );
      expect(await positionOf(db, f.aggregateId)).toEqual(2);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "resumes from the committed position after a restart",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(f.aggregateId, f.created),
        journalEvent(f.aggregateId, f.memberAdded),
      ]);

      const first = updaterOf(db, journal);
      await first.updateFromHeadStream(
        asHeadStreamEvent("INSERT", f.aggregateId, [f.created]),
      );

      // A new process starts from the beginning of the retained stream.
      const restarted = updaterOf(db, journal);
      await restarted.updateFromHeadStream(
        asHeadStreamEvent("MODIFY", f.aggregateId, [f.created, f.memberAdded]),
      );

      expect(await positionOf(db, f.aggregateId)).toEqual(2);
      expect(
        await db.groupChats.count({ where: { id: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(2);
    },
    TIMEOUT,
  );

  test(
    "ignores __config__, other aggregate types and REMOVE records",
    async () => {
      const db = requirePrisma(prisma);
      const updater = updaterOf(db, new FakeJournalReader([]));
      const f = newFixture();
      const groupChatsBefore = await db.groupChats.count();
      const positionsBefore = await db.readModelPositions.count();
      const config = asHeadStreamEvent("INSERT", "__config__", [f.created]);
      const foreign = asHeadStreamEvent(
        "INSERT",
        "UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z",
        [f.created],
      );
      const removed = asHeadStreamEvent("REMOVE", f.aggregateId, [f.created]);
      removed.Records[0].dynamodb = undefined;

      await updater.updateFromHeadStream({
        Records: [...config.Records, ...foreign.Records, ...removed.Records],
      } as unknown as DynamoDBStreamEvent);

      expect(await db.groupChats.count()).toEqual(groupChatsBefore);
      expect(await db.readModelPositions.count()).toEqual(positionsBefore);
    },
    TIMEOUT,
  );

  test(
    "creates the position row once when the first event is delivered concurrently",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const updater = updaterOf(db, new FakeJournalReader([]));
      const created = asHeadStreamEvent("INSERT", f.aggregateId, [f.created]);

      const results = await Promise.allSettled([
        updater.updateFromHeadStream(created),
        updater.updateFromHeadStream(created),
      ]);
      // A losing transaction can surface a conflict; retrying must converge.
      for (const result of results) {
        if (result.status === "rejected") {
          await updater.updateFromHeadStream(created);
        }
      }

      expect(await positionOf(db, f.aggregateId)).toEqual(1);
      expect(
        await db.groupChats.count({ where: { id: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.readModelPositions.count({
          where: { aggregateId: f.aggregateId },
        }),
      ).toEqual(1);
    },
    TIMEOUT,
  );

  test(
    "serializes concurrent events for the same aggregate and converges",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const journal = new FakeJournalReader([
        journalEvent(f.aggregateId, f.created),
        journalEvent(f.aggregateId, f.memberAdded),
      ]);
      const updater = updaterOf(db, journal);
      const created = asHeadStreamEvent("INSERT", f.aggregateId, [f.created]);
      const memberAdded = asHeadStreamEvent("MODIFY", f.aggregateId, [
        f.memberAdded,
      ]);

      await Promise.allSettled([
        updater.updateFromHeadStream(created),
        updater.updateFromHeadStream(memberAdded),
      ]);
      // Replaying both inputs after the race exercises the dedupe path and must
      // converge on the same state.
      await updater.updateFromHeadStream(created);
      await updater.updateFromHeadStream(memberAdded);

      expect(await positionOf(db, f.aggregateId)).toEqual(2);
      expect(
        await db.groupChats.count({ where: { id: f.aggregateId } }),
      ).toEqual(1);
      expect(
        await db.members.count({ where: { groupChatId: f.aggregateId } }),
      ).toEqual(2);
      expect(
        await db.readModelPositions.count({
          where: { aggregateId: f.aggregateId },
        }),
      ).toEqual(1);
    },
    TIMEOUT,
  );

  test(
    "persists, lists and deletes dead letters idempotently",
    async () => {
      const db = requirePrisma(prisma);
      const store = DeadLetterStore.createSql(db);
      const aggregateId = `GroupChat-${Date.now()}`;
      const createdAt = new Date("2026-11-07T12:00:00Z");
      const record = {
        storeId: "test-store",
        projectionName: "group-chat-read-model",
        projectionVersion: "1",
        aggregateId,
        seqNr: 4,
        failureType: "projection-error" as const,
        errorMessage: "first failure",
        attempts: 2,
        occurredAt: new Date("2026-11-07T11:59:00Z"),
        manifest: "GroupChatRenamed@1",
        recordIdentifier: "record-1",
        createdAt,
      };

      await store.save(record);
      await store.save({
        ...record,
        attempts: 3,
        errorMessage: "second failure",
        createdAt: new Date(createdAt.getTime() + 1000),
      });

      const saved = (await store.list(100)).find(
        (candidate) => candidate.aggregateId === aggregateId,
      );
      expect(saved).toMatchObject({
        storeId: "test-store",
        projectionName: "group-chat-read-model",
        projectionVersion: "1",
        aggregateId,
        seqNr: 4,
        failureType: "projection-error",
        errorMessage: "second failure",
        attempts: 5,
        manifest: "GroupChatRenamed@1",
        recordIdentifier: "record-1",
      });
      expect(saved?.occurredAt).toBeInstanceOf(Date);

      await expect(
        store.find(record.projectionName, aggregateId, 4),
      ).resolves.toMatchObject({ seqNr: 4, failureType: "projection-error" });
      await expect(
        store.find(record.projectionName, aggregateId, 5),
      ).resolves.toBeUndefined();
      expect(await store.count(record.projectionName)).toBeGreaterThanOrEqual(
        1,
      );

      await store.delete(record);
      await expect(
        store.find(record.projectionName, aggregateId, 4),
      ).resolves.toBeUndefined();
      expect(
        (await store.list(100)).find(
          (candidate) => candidate.aggregateId === aggregateId,
        ),
      ).toBeUndefined();

      // Deleting an already removed task is a no-op, so recovery can be retried.
      await expect(store.delete(record)).resolves.toBeUndefined();
    },
    TIMEOUT,
  );

  test(
    "persists an undecodable payload and recovers it from the journal",
    async () => {
      const db = requirePrisma(prisma);
      const f = newFixture();
      const store = DeadLetterStore.createSql(db);
      const journal = new FakeJournalReader([
        journalEvent(f.aggregateId, f.created),
        journalEvent(f.aggregateId, f.memberAdded),
      ]);
      const updater = ReadModelUpdater.create(
        GroupChatDao.create(db),
        journal,
        {
          deadLetters: store,
          storeId: "test-store",
          projectionName: "group-chat-read-model",
          projectionVersion: "1",
        },
      );
      const head = asHeadStreamEvent("MODIFY", f.aggregateId, [
        f.created,
        f.memberAdded,
      ]);
      corruptLastPayload(head);

      const result = await updater.updateFromHeadStream(head, {
        reportBatchItemFailures: true,
      });

      expect(result).toEqual({
        batchItemFailures: [{ itemIdentifier: "1" }],
      });
      // seq_nr 1 applied; the undecodable seq_nr 2 holds the position.
      expect(await positionOf(db, f.aggregateId)).toEqual(1);
      const saved = (await store.list(100, "group-chat-read-model")).find(
        (candidate) => candidate.aggregateId === f.aggregateId,
      );
      expect(saved).toMatchObject({
        storeId: "test-store",
        aggregateId: f.aggregateId,
        seqNr: 2,
        failureType: "payload-decode",
        attempts: 1,
      });

      const recovery = DeadLetterRecovery.create(updater, journal, store, {
        projectionName: "group-chat-read-model",
      });
      expect(await recovery.recoverAll()).toMatchObject({
        recovered: 1,
        failed: 0,
      });
      expect(await positionOf(db, f.aggregateId)).toEqual(2);
      expect(
        (await store.list(100, "group-chat-read-model")).filter(
          (candidate) => candidate.aggregateId === f.aggregateId,
        ),
      ).toEqual([]);
    },
    TIMEOUT,
  );
});

function corruptLastPayload(streamEvent: DynamoDBStreamEvent): void {
  const events = streamEvent.Records[0].dynamodb?.NewImage?.events?.L;
  const last = events?.[events.length - 1];
  if (last?.M === undefined) {
    throw new Error("expected a head event");
  }
  last.M.payload = { B: "{not-json" };
}

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
  created: HeadFixture;
  memberAdded: HeadFixture;
  renamed: HeadFixture;
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
    created: fixture(created, 1),
    memberAdded: fixture(memberAdded, 2),
    renamed: fixture(renamed, 3),
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
