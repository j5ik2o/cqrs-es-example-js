import type {
  AttributeValue,
  QueryCommand,
  QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import {
  type DynamoDBQueryClient,
  JournalReader,
  journalEventFromItem,
} from "./journal-reader";

class FakeDynamoDBQueryClient implements DynamoDBQueryClient {
  readonly commands: QueryCommand[] = [];

  constructor(private readonly pages: QueryCommandOutput[]) {}

  async send(command: QueryCommand): Promise<QueryCommandOutput> {
    this.commands.push(command);
    const page = this.pages.shift();
    if (page === undefined) {
      throw new Error("unexpected QueryCommand");
    }
    return page;
  }
}

function wirePayload(event: GroupChatEvent): string {
  return JSON.stringify({ type: event.typeName, data: event });
}

function journalItem(
  event: GroupChatEvent,
  manifest: string = event.typeName,
): Record<string, AttributeValue> {
  return {
    aid: { S: event.aggregateId.asString() },
    seq_nr: { N: String(event.sequenceNumber) },
    occurred_at: {
      N: String(BigInt(event.occurredAt.getTime()) * BigInt(1_000_000)),
    },
    manifest: { S: manifest },
    payload: { B: new TextEncoder().encode(wirePayload(event)) },
  };
}

function page(
  items: readonly Record<string, AttributeValue>[],
  lastEvaluatedKey?: Record<string, AttributeValue>,
): QueryCommandOutput {
  return {
    $metadata: {},
    Items: [...items],
    LastEvaluatedKey: lastEvaluatedKey,
  };
}

function eventsOf(count: number): GroupChatEvent[] {
  const id = GroupChatId.generate();
  const adminId = UserAccountId.generate();
  const [gc0, created] = GroupChat.create(
    id,
    GroupChatName.of("name"),
    adminId,
  );
  const events: GroupChatEvent[] = [created];
  let current = gc0;
  for (let seq = 2; seq <= count; seq++) {
    const [next, event] = unwrap(
      current.rename(GroupChatName.of(`name-${seq}`), adminId),
    );
    events.push(event);
    current = next;
  }
  return events;
}

describe("DynamoDBJournalReader", () => {
  test("reads the requested range with strong consistency in ascending order", async () => {
    const events = eventsOf(3);
    const client = new FakeDynamoDBQueryClient([
      page(events.map((event) => journalItem(event))),
    ]);
    const reader = JournalReader.createDynamoDB(client, "journal");

    const result = await reader.readEvents(
      events[0].aggregateId.asString(),
      1,
      3,
    );

    expect(result.map((event) => event.seqNr)).toEqual([1, 2, 3]);
    expect(result.map((event) => event.event.typeName)).toEqual([
      "GroupChatCreated",
      "GroupChatRenamed",
      "GroupChatRenamed",
    ]);
    expect(result[0].occurredAt).toEqual(events[0].occurredAt);
    expect(result[0].manifest).toEqual("GroupChatCreated");

    const input = client.commands[0].input;
    expect(input.TableName).toEqual("journal");
    expect(input.ConsistentRead).toEqual(true);
    expect(input.ScanIndexForward).toEqual(true);
    expect(input.KeyConditionExpression).toEqual(
      "aid = :aid AND seq_nr BETWEEN :fromSeqNr AND :toSeqNr",
    );
    expect(input.ExpressionAttributeValues).toEqual({
      ":aid": { S: events[0].aggregateId.asString() },
      ":fromSeqNr": { N: "1" },
      ":toSeqNr": { N: "3" },
    });
  });

  test("follows LastEvaluatedKey until the range is exhausted", async () => {
    const events = eventsOf(3);
    const client = new FakeDynamoDBQueryClient([
      page(
        events.slice(0, 2).map((event) => journalItem(event)),
        { aid: { S: events[0].aggregateId.asString() }, seq_nr: { N: "2" } },
      ),
      page([journalItem(events[2])]),
    ]);
    const reader = JournalReader.createDynamoDB(client, "journal");

    const result = await reader.readEvents(
      events[0].aggregateId.asString(),
      1,
      3,
    );

    expect(result.map((event) => event.seqNr)).toEqual([1, 2, 3]);
    expect(client.commands).toHaveLength(2);
    expect(client.commands[1].input.ExclusiveStartKey).toEqual({
      aid: { S: events[0].aggregateId.asString() },
      seq_nr: { N: "2" },
    });
  });

  test("uses the manifest when the payload omits the type discriminator", async () => {
    const events = eventsOf(1);
    const event = events[0];
    const item = journalItem(event, `${event.typeName}@1`);
    const payload = JSON.parse(wirePayload(event));
    item.payload = {
      B: new TextEncoder().encode(JSON.stringify(payload.data)),
    };

    const decoded = journalEventFromItem(item);

    expect(decoded.event.typeName).toEqual("GroupChatCreated");
  });

  test("returns no events for an empty range", async () => {
    const client = new FakeDynamoDBQueryClient([]);
    const reader = JournalReader.createDynamoDB(client, "journal");

    await expect(
      reader.readEvents("GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z", 3, 2),
    ).resolves.toEqual([]);
    expect(client.commands).toHaveLength(0);
  });
});

function unwrap<E extends { message: string }, Ev extends GroupChatEvent>(
  result: { type: "ok"; value: [GroupChat, Ev] } | { type: "err"; error: E },
): [GroupChat, Ev] {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}
