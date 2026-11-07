import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
  manifestOf,
} from "cqrs-es-example-js-command-domain";
import { decodeDynamoDBStreamEvent } from "./dynamodb-adapter";
import { decodeSpannerPubSubMessage } from "./spanner-pubsub-adapter";

// The ESA v5 journal item: metadata columns plus a pure domain JSON payload.
function asDynamoDBStreamEvent(
  event: GroupChatEvent,
  aggregateId: string,
  sequenceNumber: number,
  occurredAt: Date,
): DynamoDBStreamEvent {
  const nanos = (BigInt(occurredAt.getTime()) * BigInt(1_000_000)).toString();
  return {
    Records: [
      {
        eventName: "INSERT",
        dynamodb: {
          ApproximateCreationDateTime: 1_700_000_000,
          NewImage: {
            aid: { S: aggregateId },
            seq_nr: { N: String(sequenceNumber) },
            occurred_at: { N: nanos },
            manifest: { S: manifestOf(event.typeName) },
            // LocalStack carries a raw JSON string in the B field.
            payload: { B: JSON.stringify(GroupChatEvent.toJSON(event)) },
          },
          SequenceNumber: "000000000000000000001",
        },
      },
    ],
  } as unknown as DynamoDBStreamEvent;
}

function asSpannerPubSubMessage(
  event: GroupChatEvent,
  aggregateId: string,
  sequenceNumber: number,
  commitTimestamp: string,
) {
  return {
    data: Buffer.from(
      JSON.stringify(GroupChatEvent.toJSON(event)),
      "utf-8",
    ).toString("base64"),
    attributes: {
      aggregateId,
      sequenceNumber: String(sequenceNumber),
      manifest: manifestOf(event.typeName),
      commitTimestamp,
    },
    messageId: "msg-1",
  };
}

describe("RMU adapter contract", () => {
  test("DynamoDB and Spanner Pub/Sub adapters produce an equivalent wrapper", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [groupChat, created] = GroupChat.create(
      id,
      GroupChatName.of("name"),
      adminId,
    );
    const occurredAt = new Date("2026-05-30T00:00:00.000Z");

    const [fromDynamoDBStream] = decodeDynamoDBStreamEvent(
      asDynamoDBStreamEvent(created, id.asString(), 1, occurredAt),
    );
    const [fromSpannerPubSub] = decodeSpannerPubSubMessage(
      asSpannerPubSubMessage(
        created,
        id.asString(),
        1,
        occurredAt.toISOString(),
      ),
    );

    // Same decoded domain event identity across providers.
    expect(fromDynamoDBStream.event.typeName).toEqual(
      fromSpannerPubSub.event.typeName,
    );
    expect(fromDynamoDBStream.aggregateId).toEqual(
      fromSpannerPubSub.aggregateId,
    );
    expect(fromDynamoDBStream.sequenceNumber).toEqual(
      fromSpannerPubSub.sequenceNumber,
    );
    expect(fromDynamoDBStream.aggregateId).toEqual(id.asString());
    expect(fromDynamoDBStream.sequenceNumber).toEqual(1);
    expect(fromDynamoDBStream.occurredAt?.toISOString()).toEqual(
      occurredAt.toISOString(),
    );
    expect(fromSpannerPubSub.occurredAt?.toISOString()).toEqual(
      occurredAt.toISOString(),
    );

    // Provider is tracked distinctly for diagnostics.
    expect(fromDynamoDBStream.sourceProvider).toEqual("dynamodb");
    expect(fromSpannerPubSub.sourceProvider).toEqual("spanner");

    // Both carry a position for ordering/idempotency.
    expect(fromDynamoDBStream.position).toBeDefined();
    expect(fromSpannerPubSub.position).toBeDefined();
    expect(groupChat.sequenceNumber).toEqual(1);
  });

  test("Spanner Pub/Sub adapter reconstructs the full created event payload", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(
      id,
      GroupChatName.of("hello"),
      adminId,
    );

    const [input] = decodeSpannerPubSubMessage(
      asSpannerPubSubMessage(
        created,
        id.asString(),
        1,
        "2026-05-30T00:00:00.000Z",
      ),
    );
    if (input.event.typeName !== "GroupChatCreated") {
      throw new Error("expected GroupChatCreated");
    }
    expect(input.event.name.value).toEqual("hello");
    expect(input.event.members.values[0].userAccountId.value).toEqual(
      adminId.value,
    );
    expect(input.observedAt.toISOString()).toEqual("2026-05-30T00:00:00.000Z");
  });

  test("DynamoDB adapter skips the store's __config__ journal item", () => {
    const configRecord = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              aid: { S: "__config__" },
              seq_nr: { N: "0" },
              store_id: { S: "store" },
              layout_version: { N: "1" },
            },
            SequenceNumber: "000000000000000000001",
          },
        },
      ],
    } as unknown as DynamoDBStreamEvent;

    expect(decodeDynamoDBStreamEvent(configRecord)).toEqual([]);
  });

  test("DynamoDB adapter rejects INSERT records without a journal payload", () => {
    const dynamodbStreamEvent = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              aid: { S: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z" },
              seq_nr: { N: "1" },
            },
            SequenceNumber: "000000000000000000002",
          },
        },
      ],
    } as unknown as DynamoDBStreamEvent;

    expect(() => decodeDynamoDBStreamEvent(dynamodbStreamEvent)).toThrow(
      "DynamoDB INSERT record is missing NewImage.payload.B",
    );
  });
});
