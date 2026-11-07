import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  GroupChat,
  type GroupChatEvent,
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import { decodeHeadStreamEvent } from "./dynamodb-adapter";
import { decodeSpannerPubSubMessage } from "./spanner-pubsub-adapter";

type PayloadEncoding = "raw" | "base64" | "bytes";

// The event-store serializer envelope: JSON.stringify({ type, data }).
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

function headRecord(
  eventName: "INSERT" | "MODIFY" | "REMOVE",
  aggregateId: string,
  events: readonly GroupChatEvent[],
  encoding: PayloadEncoding = "raw",
): DynamoDBStreamEvent {
  return {
    Records: [
      {
        eventName,
        dynamodb: {
          ApproximateCreationDateTime: 1_700_000_000,
          SequenceNumber: "000000000000000000001",
          NewImage: {
            aid: { S: aggregateId },
            type_name: { S: "GroupChat" },
            seq_nr: {
              N: String(events[events.length - 1]?.sequenceNumber ?? 0),
            },
            events: {
              L: events.map((event) => ({
                M: {
                  seq_nr: { N: String(event.sequenceNumber) },
                  occurred_at: {
                    N: String(
                      BigInt(event.occurredAt.getTime()) * BigInt(1_000_000),
                    ),
                  },
                  manifest: { S: event.typeName },
                  payload: { B: encodePayload(wirePayload(event), encoding) },
                },
              })),
            },
          },
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
  test("DynamoDB head and Spanner Pub/Sub adapters produce an equivalent wrapper", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(id, GroupChatName.of("name"), adminId);

    const [fromHeadStream] = decodeHeadStreamEvent(
      headRecord("INSERT", id.asString(), [created]),
    );
    const [fromSpannerPubSub] = decodeSpannerPubSubMessage(
      asSpannerPubSubMessage(created),
    );

    // Same decoded domain event identity across providers.
    expect(fromHeadStream.event.typeName).toEqual(
      fromSpannerPubSub.event.typeName,
    );
    expect(fromHeadStream.aggregateId).toEqual(fromSpannerPubSub.aggregateId);
    expect(fromHeadStream.sequenceNumber).toEqual(
      fromSpannerPubSub.sequenceNumber,
    );
    expect(fromHeadStream.aggregateId).toEqual(id.asString());
    expect(fromHeadStream.sequenceNumber).toEqual(1);

    // Provider is tracked distinctly for diagnostics.
    expect(fromHeadStream.sourceProvider).toEqual("dynamodb");
    expect(fromSpannerPubSub.sourceProvider).toEqual("spanner");

    // Both carry a position for ordering/idempotency.
    expect(fromHeadStream.position).toBeDefined();
    expect(fromSpannerPubSub.position).toBeDefined();
  });

  test("decodes both INSERT and MODIFY head records", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [gc0, created] = GroupChat.create(
      id,
      GroupChatName.of("name"),
      adminId,
    );
    const memberId = UserAccountId.generate();
    const [, memberAdded] = unwrap(gc0.addMember(memberId, "member", adminId));

    const inputs = decodeHeadStreamEvent({
      Records: [
        ...headRecord("INSERT", id.asString(), [created]).Records,
        ...headRecord("MODIFY", id.asString(), [memberAdded]).Records,
      ],
    } as unknown as DynamoDBStreamEvent);

    expect(inputs.map((input) => input.sequenceNumber)).toEqual([1, 2]);
    expect(inputs.map((input) => input.event.typeName)).toEqual([
      "GroupChatCreated",
      "GroupChatMemberAdded",
    ]);
  });

  test("sorts the events inside one head record and uses the envelope timestamp", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [gc0, created] = GroupChat.create(
      id,
      GroupChatName.of("name"),
      adminId,
    );
    const memberId = UserAccountId.generate();
    const [gc1, memberAdded] = unwrap(
      gc0.addMember(memberId, "member", adminId),
    );
    const [, renamed] = unwrap(
      gc1.rename(GroupChatName.of("renamed"), adminId),
    );

    const streamEvent = headRecord("MODIFY", id.asString(), [
      renamed,
      created,
      memberAdded,
    ]);
    const image = streamEvent.Records[0].dynamodb?.NewImage;
    image?.events?.L?.reverse();

    const inputs = decodeHeadStreamEvent(streamEvent);

    expect(inputs.map((input) => input.sequenceNumber)).toEqual([1, 2, 3]);
    expect(inputs[2].event.typeName).toEqual("GroupChatRenamed");
    expect(inputs[0].occurredAt).toEqual(created.occurredAt);
  });

  test("skips __config__, other aggregate types and REMOVE records", () => {
    const id = GroupChatId.generate();
    const adminId = UserAccountId.generate();
    const [, created] = GroupChat.create(id, GroupChatName.of("name"), adminId);

    const config = headRecord("INSERT", "__config__", [created]);
    const foreign = headRecord(
      "INSERT",
      "UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z",
      [created],
    );
    const removed = headRecord("REMOVE", id.asString(), [created]);
    removed.Records[0].dynamodb = undefined;

    const inputs = decodeHeadStreamEvent({
      Records: [...config.Records, ...foreign.Records, ...removed.Records],
    } as unknown as DynamoDBStreamEvent);

    expect(inputs).toEqual([]);
  });

  test("decodes every head payload encoding (raw / base64 / bytes)", () => {
    const encodings: PayloadEncoding[] = ["raw", "base64", "bytes"];
    for (const encoding of encodings) {
      const id = GroupChatId.generate();
      const adminId = UserAccountId.generate();
      const [, created] = GroupChat.create(
        id,
        GroupChatName.of(`gc-${encoding}`),
        adminId,
      );

      const [input] = decodeHeadStreamEvent(
        headRecord("INSERT", id.asString(), [created], encoding),
      );

      if (input.event.typeName !== "GroupChatCreated") {
        throw new Error("expected GroupChatCreated");
      }
      expect(input.event.name.value).toEqual(`gc-${encoding}`);
    }
  });

  test("rejects a head record without an events list", () => {
    const dynamodbStreamEvent = {
      Records: [
        {
          eventName: "INSERT",
          dynamodb: {
            NewImage: {
              aid: { S: "GroupChat-01H42K4ABWQ5V2XQEP3A48VE0Z" },
              type_name: { S: "GroupChat" },
              seq_nr: { N: "1" },
            },
            SequenceNumber: "000000000000000000002",
          },
        },
      ],
    } as unknown as DynamoDBStreamEvent;

    expect(() => decodeHeadStreamEvent(dynamodbStreamEvent)).toThrow(
      "missing NewImage.events",
    );
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
