import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { decodeDynamoDBStreamEvent } from "./dynamodb-adapter";
import { decodeSpannerPubSubMessage } from "./spanner-pubsub-adapter";

// The event-store serializer envelope: JSON.stringify({ type, data }).
function wirePayload(event: GroupChatEvent): string {
  return JSON.stringify({ type: event.typeName, data: event });
}

function asDynamoDBStreamEvent(event: GroupChatEvent): DynamoDBStreamEvent {
  return {
    Records: [
      {
        eventName: "INSERT",
        dynamodb: {
          ApproximateCreationDateTime: 1_700_000_000,
          NewImage: {
            // LocalStack carries a raw JSON string in the B field.
            payload: { B: wirePayload(event) },
          },
          SequenceNumber: "000000000000000000001",
        },
      },
    ],
  } as unknown as DynamoDBStreamEvent;
}

function asSpannerPubSubMessage(event: GroupChatEvent) {
  return {
    data: Buffer.from(wirePayload(event), "utf-8").toString("base64"),
    attributes: {
      aggregateId: event.aggregateId.asString(),
      sequenceNumber: String(event.sequenceNumber),
      commitTimestamp: "2026-05-30T00:00:00.000Z",
    },
    messageId: "msg-1",
  };
}

describe("RMU adapter contract", () => {
  test("DynamoDB and Spanner Pub/Sub adapters produce an equivalent wrapper", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(id, GroupChatName.of("name"), adminId);

    const [fromDynamoDBStream] = decodeDynamoDBStreamEvent(
      asDynamoDBStreamEvent(created),
    );
    const [fromSpannerPubSub] = decodeSpannerPubSubMessage(
      asSpannerPubSubMessage(created),
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

    // Provider is tracked distinctly for diagnostics.
    expect(fromDynamoDBStream.sourceProvider).toEqual("dynamodb");
    expect(fromSpannerPubSub.sourceProvider).toEqual("spanner");

    // Both carry a position for ordering/idempotency.
    expect(fromDynamoDBStream.position).toBeDefined();
    expect(fromSpannerPubSub.position).toBeDefined();
  });

  test("Spanner Pub/Sub adapter reconstructs the full created event payload", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(
      id,
      GroupChatName.of("hello"),
      adminId,
    );

    const [input] = decodeSpannerPubSubMessage(asSpannerPubSubMessage(created));
    if (input.event.typeName !== "GroupChatCreated") {
      throw new Error("expected GroupChatCreated");
    }
    expect(input.event.name.value).toEqual("hello");
    expect(input.event.members.values[0].userAccountId.value).toEqual(
      adminId.value,
    );
    expect(input.observedAt.toISOString()).toEqual("2026-05-30T00:00:00.000Z");
  });

  test("DynamoDB adapter rejects INSERT records without a journal payload", () => {
    const dynamodbStreamEvent = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {},
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
