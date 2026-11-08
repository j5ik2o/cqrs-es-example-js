import type { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  DeadLetterNotifier,
  deadLetterId,
  deadLetterNotification,
} from "./dead-letter-notifier";
import type { DeadLetterRecord } from "./dead-letter-store";

const RECORD: DeadLetterRecord = {
  storeId: "dynamodb-head",
  projectionName: "group-chat-read-model",
  projectionVersion: "1",
  aggregateId: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z",
  seqNr: 4,
  failureType: "payload-decode",
  errorMessage: "Head event payload is not valid JSON",
  attempts: 2,
  occurredAt: new Date("2026-11-08T00:00:00.000Z"),
  manifest: "GroupChatRenamed@1",
  recordIdentifier: "record-1",
  createdAt: new Date("2026-11-08T00:00:01.000Z"),
};

class FakeSqs {
  readonly commands: SendMessageCommand[] = [];

  async send(command: SendMessageCommand): Promise<unknown> {
    this.commands.push(command);
    return {};
  }
}

describe("dead-letter notification", () => {
  test("carries the task identity and excludes the event body", () => {
    expect(deadLetterNotification(RECORD)).toEqual({
      deadLetterId:
        "group-chat-read-model:GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z:4",
      storeId: "dynamodb-head",
      projectionName: "group-chat-read-model",
      projectionVersion: "1",
      aggregateId: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z",
      seqNr: 4,
      failureType: "payload-decode",
      attempts: 2,
      occurredAt: "2026-11-08T00:00:00.000Z",
      manifest: "GroupChatRenamed@1",
      recordIdentifier: "record-1",
    });
  });

  test("sends the identity to a standard queue without FIFO fields", async () => {
    const client = new FakeSqs();
    const notifier = DeadLetterNotifier.createSqs(
      client,
      "https://sqs.example/dead-letters",
    );

    await notifier.notify(RECORD);

    const [command] = client.commands;
    const input = command.input;
    expect(input.QueueUrl).toEqual("https://sqs.example/dead-letters");
    expect(JSON.parse(input.MessageBody ?? "")).toEqual(
      deadLetterNotification(RECORD),
    );
    expect(input.MessageAttributes).toMatchObject({
      projection_name: {
        DataType: "String",
        StringValue: "group-chat-read-model",
      },
      failure_type: { DataType: "String", StringValue: "payload-decode" },
      aggregate_id: {
        DataType: "String",
        StringValue: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z",
      },
      seq_nr: { DataType: "Number", StringValue: "4" },
    });
    expect(input.MessageGroupId).toBeUndefined();
    expect(input.MessageDeduplicationId).toBeUndefined();
  });

  test("sets FIFO group and deduplication fields only when configured", async () => {
    const client = new FakeSqs();
    const notifier = DeadLetterNotifier.createSqs(
      client,
      "https://sqs.example/dead-letters.fifo",
      { messageGroupId: "dead-letters" },
    );

    await notifier.notify(RECORD);

    const input = client.commands[0].input;
    expect(input.MessageGroupId).toEqual("dead-letters");
    expect(input.MessageDeduplicationId).toEqual(deadLetterId(RECORD));
  });
});
