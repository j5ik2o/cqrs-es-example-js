import type { AttributeValue } from "aws-lambda";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  type Member,
  type Message,
  type MessageId,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import type { DeadLetterRecord, DeadLetterStore } from "./dead-letter-store";
import { decodeHeadScanItems } from "./dynamodb-adapter";
import {
  DeadLetterWriteError,
  ProjectionGapError,
  classifyFailure,
} from "./failures";
import type { GroupChatDao } from "./group-chat-dao";
import type { JournalEvent, JournalReader } from "./journal-reader";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";
import { DeadLetterRecovery } from "./recovery";
import { RetryExhaustedError, type RetryPolicy } from "./retry";
import {
  needsFullResynchronization,
  processStream,
  resynchronizeFromHead,
} from "./stream-recovery";
import { ReadModelUpdater } from "./update-read-model";

// --- Fixtures -------------------------------------------------------------

type Fixture = {
  aggregateId: string;
  adminId: UserAccountId;
  events: GroupChatEvent[];
};

function occurredAtOf(seqNr: number): Date {
  return new Date(1_700_000_000_000 + seqNr * 1_000);
}

function newFixture(count: number): Fixture {
  const id = GroupChatId.generate();
  const adminId = UserAccountId.generate();
  const [createdState, created] = GroupChat.create(
    id,
    GroupChatName.of("name"),
    adminId,
  );
  const events: GroupChatEvent[] = [created];
  let current = createdState;
  for (let seq = 2; seq <= count; seq++) {
    const [next, event] = unwrap(
      current.rename(GroupChatName.of(`name-${seq}`), adminId),
    );
    events.push(event);
    current = next;
  }
  return { aggregateId: id.asString(), adminId, events };
}

function inputOf(
  fixture: Fixture,
  seqNr: number,
  recordIdentifier?: string,
): ReadModelUpdaterInput {
  const event = fixture.events[seqNr - 1];
  if (event === undefined) {
    throw new Error(`missing fixture event ${seqNr}`);
  }
  return {
    event,
    aggregateId: fixture.aggregateId,
    sequenceNumber: seqNr,
    sourceProvider: "dynamodb",
    observedAt: occurredAtOf(seqNr),
    occurredAt: occurredAtOf(seqNr),
    manifest: `${event.typeName}@1`,
    recordIdentifier,
  };
}

function journalEventOf(fixture: Fixture, seqNr: number): JournalEvent {
  const event = fixture.events[seqNr - 1];
  if (event === undefined) {
    throw new Error(`missing fixture event ${seqNr}`);
  }
  return {
    aggregateId: fixture.aggregateId,
    seqNr,
    occurredAt: occurredAtOf(seqNr),
    manifest: `${event.typeName}@1`,
    payload: new TextEncoder().encode(JSON.stringify(event)),
    event,
  };
}

// --- In-memory doubles ----------------------------------------------------

type AppliedEvent = { aggregateId: string; seqNr: number };

class MemoryGroupChatDao implements GroupChatDao {
  readonly positions = new Map<string, number>();
  readonly applied: AppliedEvent[] = [];
  private readonly failures = new Map<
    string,
    { error: unknown; remaining: number }
  >();

  fail(aggregateId: string, seqNr: number, error: unknown, times = 1): void {
    this.failures.set(`${aggregateId}#${seqNr}`, {
      error,
      remaining: times,
    });
  }

  clearFailures(): void {
    this.failures.clear();
  }

  async getPosition(aggregateId: string): Promise<number> {
    return this.positions.get(aggregateId) ?? 0;
  }

  async insertGroupChat(
    aggregateId: GroupChatId,
    _name: GroupChatName,
    _administrator: Member,
    _createdAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async deleteGroupChat(
    aggregateId: GroupChatId,
    _updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async updateGroupChatName(
    aggregateId: GroupChatId,
    _name: GroupChatName,
    _updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async insertMember(
    aggregateId: GroupChatId,
    _member: Member,
    _createdAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async deleteMember(
    aggregateId: GroupChatId,
    _userAccountId: UserAccountId,
    _updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async insertMessage(
    aggregateId: GroupChatId,
    _message: Message,
    _createdAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async updateMessage(
    aggregateId: GroupChatId,
    _message: Message,
    _updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  async deleteMessage(
    aggregateId: GroupChatId,
    _messageId: MessageId,
    _updatedAt: Date,
    sequenceNumber: number,
  ): Promise<void> {
    this.advance(aggregateId.asString(), sequenceNumber);
  }

  private advance(aggregateId: string, sequenceNumber: number): void {
    const failure = this.failures.get(`${aggregateId}#${sequenceNumber}`);
    if (failure !== undefined && failure.remaining > 0) {
      failure.remaining -= 1;
      throw failure.error;
    }
    const current = this.positions.get(aggregateId) ?? 0;
    if (sequenceNumber <= current) {
      return;
    }
    if (sequenceNumber !== current + 1) {
      throw new ProjectionGapError(
        `projection gap: expected ${current + 1}, got ${sequenceNumber}`,
      );
    }
    this.positions.set(aggregateId, sequenceNumber);
    this.applied.push({ aggregateId, seqNr: sequenceNumber });
  }
}

class MemoryJournalReader implements JournalReader {
  readonly events: JournalEvent[];
  readonly calls: {
    aggregateId: string;
    fromSeqNr: number;
    toSeqNr: number;
  }[] = [];

  constructor(events: readonly JournalEvent[]) {
    this.events = [...events];
  }

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

class MemoryDeadLetterStore implements DeadLetterStore {
  readonly records = new Map<string, DeadLetterRecord>();
  failSave = false;

  async save(record: DeadLetterRecord): Promise<void> {
    if (this.failSave) {
      throw new Error("dead-letter store unavailable");
    }
    this.records.set(keyOf(record), record);
  }

  async list(
    limit: number,
    projectionName?: string,
  ): Promise<DeadLetterRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          projectionName === undefined ||
          record.projectionName === projectionName,
      )
      .slice(0, limit);
  }

  async delete(record: DeadLetterRecord): Promise<void> {
    this.records.delete(keyOf(record));
  }
}

function keyOf(record: DeadLetterRecord): string {
  return `${record.projectionName}:${record.aggregateId}:${record.seqNr}`;
}

const FAST_RETRY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 10,
  maxDelayMs: 20,
  maxElapsedMs: 10_000,
  jitterRatio: 0,
};

function noSleep(): Promise<void> {
  return Promise.resolve();
}

function updaterOf(
  dao: GroupChatDao,
  journal: JournalReader,
  deadLetters?: DeadLetterStore,
  retry: RetryPolicy = FAST_RETRY,
): ReadModelUpdater {
  return ReadModelUpdater.create(dao, journal, {
    retry,
    deadLetters,
    sleep: noSleep,
    random: () => 0.5,
    storeId: "test-store",
    projectionName: "group-chat-read-model",
    projectionVersion: "7",
  });
}

// --- Tests ----------------------------------------------------------------

describe("bounded retry", () => {
  test("retries a failed event and leaves the position untouched until success", async () => {
    const fixture = newFixture(2);
    const dao = new MemoryGroupChatDao();
    const sleeps: number[] = [];
    dao.fail(fixture.aggregateId, 2, new Error("temporary projection bug"), 1);
    const updater = ReadModelUpdater.create(
      dao,
      new MemoryJournalReader([journalEventOf(fixture, 1)]),
      {
        retry: FAST_RETRY,
        sleep: async (millis) => {
          sleeps.push(millis);
        },
        random: () => 0.5,
      },
    );

    const result = await updater.apply([inputOf(fixture, 2)], {
      reportBatchItemFailures: true,
    });

    expect(result).toEqual({ batchItemFailures: [] });
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(2);
    expect(dao.applied.map((event) => event.seqNr)).toEqual([1, 2]);
    expect(sleeps).toEqual([10]);
  });

  test("persists a dead letter when retries are exhausted, then recovers from it", async () => {
    const fixture = newFixture(3);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    const journal = new MemoryJournalReader([
      journalEventOf(fixture, 1),
      journalEventOf(fixture, 2),
      journalEventOf(fixture, 3),
    ]);
    dao.fail(
      fixture.aggregateId,
      2,
      new Error("cannot project this event"),
      10,
    );
    const updater = updaterOf(dao, journal, deadLetters);

    const result = await updater.apply([inputOf(fixture, 2, "record-2")], {
      reportBatchItemFailures: true,
    });

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: "record-2" }],
    });
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(1);
    const [record] = await deadLetters.list(10);
    expect(record).toMatchObject({
      storeId: "test-store",
      projectionName: "group-chat-read-model",
      projectionVersion: "7",
      aggregateId: fixture.aggregateId,
      seqNr: 2,
      failureType: "projection-error",
      attempts: 3,
      recordIdentifier: "record-2",
    });

    dao.clearFailures();
    const recovery = DeadLetterRecovery.create(updater, journal, deadLetters);
    const outcome = await recovery.recoverAll();

    expect(outcome).toMatchObject({ recovered: 1, failed: 0, remaining: 0 });
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(2);
    expect(await deadLetters.list(10)).toEqual([]);
  });

  test("does not dead-letter an infrastructure failure", async () => {
    const fixture = newFixture(1);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    const throttled = new Error("slow down");
    throttled.name = "ThrottlingException";
    dao.fail(fixture.aggregateId, 1, throttled, 10);
    const updater = updaterOf(dao, new MemoryJournalReader([]), deadLetters);

    await expect(
      updater.apply([inputOf(fixture, 1)], {
        reportBatchItemFailures: true,
      }),
    ).rejects.toBeInstanceOf(RetryExhaustedError);

    expect(await deadLetters.list(10)).toEqual([]);
    expect(classifyFailure(throttled)).toEqual({
      type: "transient",
      retryable: true,
      transient: true,
    });
  });

  test("throws when the dead letter itself cannot be persisted", async () => {
    const fixture = newFixture(1);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    deadLetters.failSave = true;
    dao.fail(fixture.aggregateId, 1, new Error("permanent"), 10);
    const updater = updaterOf(dao, new MemoryJournalReader([]), deadLetters);

    await expect(
      updater.apply([inputOf(fixture, 1)], {
        reportBatchItemFailures: true,
      }),
    ).rejects.toBeInstanceOf(DeadLetterWriteError);
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(0);
  });
});

describe("batch handling", () => {
  test("reports only the failed record and still applies other aggregates", async () => {
    const failing = newFixture(1);
    const healthy = newFixture(1);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    dao.fail(failing.aggregateId, 1, new Error("bad event"), 10);
    const updater = updaterOf(dao, new MemoryJournalReader([]), deadLetters);

    const result = await updater.apply(
      [
        inputOf(failing, 1, "record-failing"),
        inputOf(healthy, 1, "record-healthy"),
      ],
      { reportBatchItemFailures: true },
    );

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: "record-failing" }],
    });
    expect(await dao.getPosition(failing.aggregateId)).toEqual(0);
    expect(await dao.getPosition(healthy.aggregateId)).toEqual(1);
    expect(await deadLetters.list(10)).toHaveLength(1);
  });

  test("does not apply a later event of an aggregate whose earlier event failed", async () => {
    const fixture = newFixture(3);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    dao.fail(fixture.aggregateId, 2, new Error("bad event"), 10);
    const updater = updaterOf(
      dao,
      new MemoryJournalReader([journalEventOf(fixture, 1)]),
      deadLetters,
    );

    const result = await updater.apply(
      [inputOf(fixture, 2, "record-2"), inputOf(fixture, 3, "record-3")],
      { reportBatchItemFailures: true },
    );

    expect(result).toEqual({
      batchItemFailures: [
        { itemIdentifier: "record-2" },
        { itemIdentifier: "record-3" },
      ],
    });
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(1);
    expect(await deadLetters.list(10)).toHaveLength(1);
  });

  test("dead-letters a journal gap without retrying it", async () => {
    const fixture = newFixture(3);
    const dao = new MemoryGroupChatDao();
    const deadLetters = new MemoryDeadLetterStore();
    const sleeps: number[] = [];
    // The journal has seq_nr 1 but the head asks for 3, so seq_nr 2 is missing.
    const updater = ReadModelUpdater.create(
      dao,
      new MemoryJournalReader([journalEventOf(fixture, 1)]),
      {
        retry: FAST_RETRY,
        deadLetters,
        sleep: async (millis) => {
          sleeps.push(millis);
        },
        random: () => 0.5,
      },
    );

    await updater.apply([inputOf(fixture, 3, "record-3")], {
      reportBatchItemFailures: true,
    });

    const [record] = await deadLetters.list(10);
    expect(record?.failureType).toEqual("journal-gap");
    expect(record?.attempts).toEqual(1);
    expect(sleeps).toEqual([]);
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(0);
  });
});

describe("resynchronization", () => {
  test("fills the read model from a head Scan and is idempotent", async () => {
    const fixture = newFixture(3);
    const dao = new MemoryGroupChatDao();
    const updater = updaterOf(
      dao,
      new MemoryJournalReader([
        journalEventOf(fixture, 1),
        journalEventOf(fixture, 2),
        journalEventOf(fixture, 3),
      ]),
    );
    const headItem = headImage(fixture, 3);

    const applied = await resynchronizeFromHead({
      scan: async () => [headItem],
      apply: (inputs) => updater.apply(inputs),
    });

    expect(applied).toEqual(1);
    expect(await dao.getPosition(fixture.aggregateId)).toEqual(3);
    expect(dao.applied.map((event) => event.seqNr)).toEqual([1, 2, 3]);

    await resynchronizeFromHead({
      scan: async () => [headItem],
      apply: (inputs) => updater.apply(inputs),
    });
    expect(dao.applied.map((event) => event.seqNr)).toEqual([1, 2, 3]);
  });

  test("decodes scan items and skips the config item and foreign types", () => {
    const fixture = newFixture(2);
    const inputs = decodeHeadScanItems([
      { aid: { S: "__config__" } },
      headImage(fixture, 2),
      { aid: { S: "UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z" } },
    ]);

    expect(inputs.map((input) => input.sequenceNumber)).toEqual([2]);
    expect(inputs[0].aggregateId).toEqual(fixture.aggregateId);
  });

  test("treats an unknown or older-than-retention position as a full resync", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const retentionMs = 24 * 60 * 60 * 1000;
    expect(needsFullResynchronization(undefined, now, retentionMs)).toBe(true);
    expect(
      needsFullResynchronization(
        new Date(now.getTime() - retentionMs + 1),
        now,
        retentionMs,
      ),
    ).toBe(false);
    expect(
      needsFullResynchronization(
        new Date(now.getTime() - retentionMs),
        now,
        retentionMs,
      ),
    ).toBe(true);
  });

  test("recovers from an empty pass through the stream processor after a startup scan", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    let resynchronized = 0;
    const result = await processStream({
      client: {
        listShards: async () => [],
        getShardIterator: async () => "iterator",
        getRecords: async () => ({ records: [] }),
      },
      resynchronize: async () => {
        resynchronized += 1;
      },
      persist: async () => ({ failed: false }),
      lastProcessedAt: undefined,
      now: () => now,
    });

    expect(resynchronized).toEqual(1);
    expect(result.resynchronizations).toEqual(1);
    expect(result.processedRecords).toEqual(0);
  });

  test("resumes a shard after an expired iterator without a full resync", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const iteratorCalls: string[] = [];
    const records = [streamRecord("seq-1"), streamRecord("seq-2")];
    let getRecordsCalls = 0;
    let resynchronized = 0;
    const result = await processStream({
      client: {
        listShards: async () => [{ shardId: "shard-1" }],
        getShardIterator: async (_shardId, position) => {
          iteratorCalls.push(
            position.type === "trim-horizon"
              ? "trim-horizon"
              : `after:${position.sequenceNumber}`,
          );
          return `iterator-${iteratorCalls.length}`;
        },
        getRecords: async () => {
          getRecordsCalls += 1;
          if (getRecordsCalls === 1) {
            return { records: [records[0]], nextIterator: "iterator-1" };
          }
          if (getRecordsCalls === 2) {
            const expired = new Error("iterator expired");
            expired.name = "ExpiredIteratorException";
            throw expired;
          }
          return { records: [records[1]], nextIterator: undefined };
        },
      },
      resynchronize: async () => {
        resynchronized += 1;
      },
      persist: async () => ({ failed: false }),
      lastProcessedAt: now,
      now: () => now,
    });

    expect(iteratorCalls).toEqual(["trim-horizon", "after:seq-1"]);
    expect(resynchronized).toEqual(0);
    expect(result.processedRecords).toEqual(2);
  });

  test("reconciles the whole head after a trimmed stream", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const iteratorCalls: string[] = [];
    let getRecordsCalls = 0;
    let resynchronized = 0;
    const result = await processStream({
      client: {
        listShards: async () => [{ shardId: "shard-1" }],
        getShardIterator: async (_shardId, position) => {
          iteratorCalls.push(
            position.type === "trim-horizon"
              ? "trim-horizon"
              : `after:${position.sequenceNumber}`,
          );
          return `iterator-${iteratorCalls.length}`;
        },
        getRecords: async () => {
          getRecordsCalls += 1;
          if (getRecordsCalls === 1) {
            const trimmed = new Error("records trimmed");
            trimmed.name = "TrimmedDataAccessException";
            throw trimmed;
          }
          if (getRecordsCalls === 2) {
            return {
              records: [streamRecord("seq-9")],
              nextIterator: undefined,
            };
          }
          return { records: [], nextIterator: undefined };
        },
      },
      resynchronize: async () => {
        resynchronized += 1;
      },
      persist: async () => ({ failed: false }),
      lastProcessedAt: now,
      now: () => now,
    });

    expect(resynchronized).toEqual(1);
    expect(iteratorCalls).toEqual(["trim-horizon", "trim-horizon"]);
    expect(result.processedRecords).toEqual(1);
  });

  test("stops the shard when a record could not be applied", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    let persisted = 0;
    const result = await processStream({
      client: {
        listShards: async () => [{ shardId: "shard-1" }],
        getShardIterator: async () => "iterator",
        getRecords: async () => ({
          records: [streamRecord("seq-1"), streamRecord("seq-2")],
          nextIterator: "iterator-2",
        }),
      },
      resynchronize: async () => undefined,
      persist: async () => {
        persisted += 1;
        return { failed: true };
      },
      lastProcessedAt: now,
      now: () => now,
    });

    expect(persisted).toEqual(1);
    expect(result.stoppedOnFailure).toBe(true);
    expect(result.processedRecords).toEqual(2);
  });
});

// --- Helpers --------------------------------------------------------------

function headImage(
  fixture: Fixture,
  seqNr: number,
): Record<string, AttributeValue> {
  const event = fixture.events[seqNr - 1];
  if (event === undefined) {
    throw new Error(`missing fixture event ${seqNr}`);
  }
  return {
    aid: { S: fixture.aggregateId },
    type_name: { S: "GroupChat" },
    seq_nr: { N: String(seqNr) },
    events: {
      L: [
        {
          M: {
            seq_nr: { N: String(seqNr) },
            occurred_at: {
              N: String(
                BigInt(occurredAtOf(seqNr).getTime()) * BigInt(1_000_000),
              ),
            },
            manifest: { S: `${event.typeName}@1` },
            payload: {
              B: JSON.stringify(GroupChatEvent.toJSON(event)),
            },
          },
        },
      ],
    },
  };
}

function streamRecord(sequenceNumber: string) {
  return {
    eventName: "MODIFY" as const,
    sequenceNumber,
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
