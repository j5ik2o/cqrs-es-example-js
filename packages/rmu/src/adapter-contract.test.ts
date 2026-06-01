import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { decodeDynamoDBStreamEvent } from "./dynamodb-adapter";
import { decodePubSubMessage } from "./spanner-pubsub-adapter";

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

function asPubSubMessage(event: GroupChatEvent) {
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
  test("DynamoDB and Pub/Sub adapters produce an equivalent wrapper", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(id, GroupChatName.of("name"), adminId);

    const [fromDynamo] = decodeDynamoDBStreamEvent(
      asDynamoDBStreamEvent(created),
    );
    const [fromPubSub] = decodePubSubMessage(asPubSubMessage(created));

    // Same decoded domain event identity across providers.
    expect(fromDynamo.event.typeName).toEqual(fromPubSub.event.typeName);
    expect(fromDynamo.aggregateId).toEqual(fromPubSub.aggregateId);
    expect(fromDynamo.sequenceNumber).toEqual(fromPubSub.sequenceNumber);
    expect(fromDynamo.aggregateId).toEqual(id.asString());
    expect(fromDynamo.sequenceNumber).toEqual(1);

    // Provider is tracked distinctly for diagnostics.
    expect(fromDynamo.sourceProvider).toEqual("dynamodb");
    expect(fromPubSub.sourceProvider).toEqual("spanner");

    // Both carry a position for ordering/idempotency.
    expect(fromDynamo.position).toBeDefined();
    expect(fromPubSub.position).toBeDefined();
  });

  test("Pub/Sub adapter reconstructs the full created event payload", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(
      id,
      GroupChatName.of("hello"),
      adminId,
    );

    const [input] = decodePubSubMessage(asPubSubMessage(created));
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
    const event = {
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

    expect(() => decodeDynamoDBStreamEvent(event)).toThrow(
      "DynamoDB INSERT record is missing NewImage.payload.B",
    );
  });
});
