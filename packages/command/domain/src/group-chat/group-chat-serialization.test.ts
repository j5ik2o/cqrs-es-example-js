import type { Result } from "event-store-adapter-js/dist/result";
import { UserAccountId } from "../user-account";
import { GroupChat, convertJSONToGroupChat } from "./group-chat";
import type { GroupChatError } from "./group-chat-errors";
import {
  type GroupChatEvent,
  convertJSONToGroupChatEvent,
} from "./group-chat-events";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { Message } from "./message";
import { MessageId } from "./message-id";
import { Messages } from "./messages";

// Mimic the event-store default serializer: JSON.stringify({ type, data }).
function wire(typeName: string, value: unknown): unknown {
  return JSON.parse(JSON.stringify({ type: typeName, data: value }));
}

function roundTripEvent(event: GroupChatEvent): GroupChatEvent {
  return convertJSONToGroupChatEvent(wire(event.typeName, event));
}

function roundTripSnapshot(groupChat: GroupChat): GroupChat {
  return convertJSONToGroupChat(wire(groupChat.typeName, groupChat));
}

function ok<E extends GroupChatError, Ev extends GroupChatEvent>(
  result: Result<[GroupChat, Ev], E>,
): [GroupChat, Ev] {
  if (result.type === "err") {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("GroupChat serialization round-trip", () => {
  const adminId = UserAccountId.generate();
  const memberId = UserAccountId.generate();

  function buildHistory(): { snapshot: GroupChat; events: GroupChatEvent[] } {
    const id = GroupChatId.generate();
    const [g0, created] = GroupChat.create(
      id,
      GroupChatName.of("name"),
      adminId,
    );
    const [g1, renamed] = ok(g0.rename(GroupChatName.of("renamed"), adminId));
    const [g2, memberAdded] = ok(g1.addMember(memberId, "member", adminId));
    const message = Message.of(
      MessageId.generate(),
      "hello",
      memberId,
      new Date("2026-05-30T00:00:00.000Z"),
    );
    const [g3, messagePosted] = ok(g2.postMessage(message, memberId));
    const [g4, messageDeleted] = ok(g3.deleteMessage(message.id, memberId));
    const [g5, memberRemoved] = ok(g4.removeMemberById(memberId, adminId));
    const [g6, deleted] = ok(g5.delete(adminId));
    return {
      snapshot: g6,
      events: [
        created,
        renamed,
        memberAdded,
        messagePosted,
        messageDeleted,
        memberRemoved,
        deleted,
      ],
    };
  }

  test("each event round-trips through the serializer envelope", () => {
    const { events } = buildHistory();
    for (const event of events) {
      const restored = roundTripEvent(event);
      expect(restored.typeName).toEqual(event.typeName);
      expect(restored.id).toEqual(event.id);
      expect(restored.aggregateId.value).toEqual(event.aggregateId.value);
      expect(restored.executorId.value).toEqual(event.executorId.value);
      expect(restored.sequenceNumber).toEqual(event.sequenceNumber);
      expect(restored.occurredAt.getTime()).toEqual(event.occurredAt.getTime());
      expect(restored.isCreated).toEqual(event.isCreated);
    }
  });

  test("created event preserves name and members", () => {
    const { events } = buildHistory();
    const restored = roundTripEvent(events[0]);
    if (restored.typeName !== "GroupChatCreated") {
      throw new Error("expected GroupChatCreated");
    }
    expect(restored.name.value).toEqual("name");
    expect(Members.isAdministrator(restored.members, adminId)).toEqual(true);
  });

  test("message posted event preserves the message payload", () => {
    const { events } = buildHistory();
    const restored = roundTripEvent(events[3]);
    if (restored.typeName !== "GroupChatMessagePosted") {
      throw new Error("expected GroupChatMessagePosted");
    }
    expect(restored.message.content).toEqual("hello");
    expect(restored.message.senderId.value).toEqual(memberId.value);
    expect(restored.message.sentAt.toISOString()).toEqual(
      "2026-05-30T00:00:00.000Z",
    );
  });

  test("snapshot round-trips and replays to the same state", () => {
    const { snapshot } = buildHistory();
    const restored = roundTripSnapshot(snapshot);
    expect(restored.id.value).toEqual(snapshot.id.value);
    expect(restored.name.value).toEqual(snapshot.name.value);
    expect(restored.deleted).toEqual(true);
    expect(restored.sequenceNumber).toEqual(snapshot.sequenceNumber);
    expect(restored.version).toEqual(snapshot.version);
    expect(Members.equals(restored.members, snapshot.members)).toEqual(true);
    expect(Messages.size(restored.messages)).toEqual(
      Messages.size(snapshot.messages),
    );
  });

  test("replaying events from history reconstructs the aggregate", () => {
    const { snapshot, events } = buildHistory();
    const replayed = GroupChat.replayFromEvents(events);
    if (replayed === undefined) {
      throw new Error("replay returned undefined");
    }
    expect(replayed.id.value).toEqual(snapshot.id.value);
    expect(replayed.name.value).toEqual("renamed");
    expect(replayed.deleted).toEqual(true);
    expect(replayed.sequenceNumber).toEqual(snapshot.sequenceNumber);
  });
});
