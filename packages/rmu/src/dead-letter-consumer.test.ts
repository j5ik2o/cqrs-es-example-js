import { DeadLetterConsumer } from "./dead-letter-consumer";
import type { DeadLetterNotification } from "./dead-letter-notifier";
import type { DeadLetterRecord, DeadLetterStore } from "./dead-letter-store";
import type { DeadLetterRecovery, RecoveryOutcome } from "./recovery";

const RECORD: DeadLetterRecord = {
  storeId: "dynamodb-head",
  projectionName: "group-chat-read-model",
  projectionVersion: "1",
  aggregateId: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z",
  seqNr: 4,
  failureType: "payload-decode",
  errorMessage: "Head event payload is not valid JSON",
  attempts: 1,
  occurredAt: new Date("2026-11-08T00:00:00.000Z"),
  manifest: "GroupChatRenamed@1",
  createdAt: new Date("2026-11-08T00:00:01.000Z"),
};

class MemoryDeadLetterStore implements DeadLetterStore {
  readonly records = new Map<string, DeadLetterRecord>();

  async save(record: DeadLetterRecord): Promise<void> {
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

  async find(
    projectionName: string,
    aggregateId: string,
    seqNr: number,
  ): Promise<DeadLetterRecord | undefined> {
    return this.records.get(`${projectionName}:${aggregateId}:${seqNr}`);
  }

  async count(projectionName?: string): Promise<number> {
    return (await this.list(Number.MAX_SAFE_INTEGER, projectionName)).length;
  }

  async delete(record: DeadLetterRecord): Promise<void> {
    this.records.delete(keyOf(record));
  }
}

class FakeRecovery implements DeadLetterRecovery {
  readonly recovered: DeadLetterRecord[] = [];
  fail = false;

  constructor(private readonly store: DeadLetterStore) {}

  async recover(record: DeadLetterRecord): Promise<boolean> {
    if (this.fail) {
      throw new Error("recovery failed");
    }
    this.recovered.push(record);
    await this.store.delete(record);
    return true;
  }

  async recoverAll(): Promise<RecoveryOutcome> {
    throw new Error("recoverAll is not used by the consumer");
  }
}

function keyOf(record: DeadLetterRecord): string {
  return `${record.projectionName}:${record.aggregateId}:${record.seqNr}`;
}

function notificationBody(record: DeadLetterRecord): string {
  const notification: Pick<
    DeadLetterNotification,
    "projectionName" | "aggregateId" | "seqNr"
  > = {
    projectionName: record.projectionName,
    aggregateId: record.aggregateId,
    seqNr: record.seqNr,
  };
  return JSON.stringify(notification);
}

function consumerOf(store: DeadLetterStore, recovery: FakeRecovery) {
  return DeadLetterConsumer.create(recovery, store);
}

describe("dead-letter consumer", () => {
  test("recovers the authoritative row for a valid notification", async () => {
    const store = new MemoryDeadLetterStore();
    await store.save(RECORD);
    const recovery = new FakeRecovery(store);
    const consumer = consumerOf(store, recovery);

    const outcome = await consumer.consume(notificationBody(RECORD));

    expect(outcome).toEqual({ status: "recovered" });
    expect(recovery.recovered).toEqual([RECORD]);
    await expect(
      store.find(RECORD.projectionName, RECORD.aggregateId, RECORD.seqNr),
    ).resolves.toBeUndefined();
  });

  test("ignores a notification whose row is already gone", async () => {
    const store = new MemoryDeadLetterStore();
    const recovery = new FakeRecovery(store);
    const consumer = consumerOf(store, recovery);

    const outcome = await consumer.consume(notificationBody(RECORD));

    expect(outcome).toEqual({ status: "ignored", reason: "missing" });
    expect(recovery.recovered).toEqual([]);
  });

  test("ignores a duplicate notification after recovery", async () => {
    const store = new MemoryDeadLetterStore();
    await store.save(RECORD);
    const recovery = new FakeRecovery(store);
    const consumer = consumerOf(store, recovery);

    expect(await consumer.consume(notificationBody(RECORD))).toEqual({
      status: "recovered",
    });
    expect(await consumer.consume(notificationBody(RECORD))).toEqual({
      status: "ignored",
      reason: "missing",
    });
    expect(recovery.recovered).toHaveLength(1);
  });

  test("rejects malformed notifications without throwing", async () => {
    const store = new MemoryDeadLetterStore();
    const consumer = consumerOf(store, new FakeRecovery(store));

    expect(await consumer.consume("{not-json")).toMatchObject({
      status: "invalid",
    });
    expect(await consumer.consume("[]")).toMatchObject({ status: "invalid" });
    expect(
      await consumer.consume(JSON.stringify({ aggregateId: "a" })),
    ).toMatchObject({ status: "invalid" });
    expect(
      await consumer.consume(
        JSON.stringify({ projectionName: "p", aggregateId: "a", seqNr: 0 }),
      ),
    ).toMatchObject({ status: "invalid" });
  });

  test("reports a recovery failure so the queue can redeliver", async () => {
    const store = new MemoryDeadLetterStore();
    await store.save(RECORD);
    const recovery = new FakeRecovery(store);
    recovery.fail = true;
    const consumer = consumerOf(store, recovery);

    const outcome = await consumer.consume(notificationBody(RECORD));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") {
      throw new Error("expected a failed outcome");
    }
    expect(outcome.error).toBeInstanceOf(Error);
    expect(await store.count()).toBe(1);
  });
});
