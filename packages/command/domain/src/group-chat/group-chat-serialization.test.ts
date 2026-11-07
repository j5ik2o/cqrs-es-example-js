import type { Result } from "event-store-adapter-js";
import { UserAccountId } from "../user-account";
import {
  GroupChat,
  type GroupChatEventRecord,
  convertJSONToGroupChat,
} from "./group-chat";
import type { GroupChatError } from "./group-chat-errors";
import {
  GroupChatEvent,
  convertJSONToGroupChatEvent,
} from "./group-chat-events";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { Message } from "./message";
import { MessageId } from "./message-id";
import { Messages } from "./messages";

function roundTripEvent(event: GroupChatEvent): GroupChatEvent {
  return convertJSONToGroupChatEvent(GroupChatEvent.toJSON(event));
}

function roundTripSnapshot(groupChat: GroupChat): GroupChat {
  return convertJSONToGroupChat(GroupChat.toJSON(groupChat));
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

  function buildHistory(): {
    id: GroupChatId;
    snapshot: GroupChat;
    events: GroupChatEvent[];
  } {
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
    const edited = Message.of(
      message.id,
      "hello-edited",
      memberId,
      new Date("2026-05-30T00:00:01.000Z"),
    );
    const [g4, messageEdited] = ok(g3.editMessage(edited, memberId));
    const [g5, messageDeleted] = ok(g4.deleteMessage(message.id, memberId));
    const [g6, memberRemoved] = ok(g5.removeMemberById(memberId, adminId));
    const [g7, deleted] = ok(g6.delete(adminId));
    return {
      id,
      snapshot: g7,
      events: [
        created,
        renamed,
        memberAdded,
        messagePosted,
        messageEdited,
        messageDeleted,
        memberRemoved,
        deleted,
      ],
    };
  }

  test("each event round-trips through the serializer payload", () => {
    const { events } = buildHistory();
    for (const event of events) {
      const restored = roundTripEvent(event);
      expect(restored.typeName).toEqual(event.typeName);
      expect(restored.id).toEqual(event.id);
      expect(restored.executorId.value).toEqual(event.executorId.value);
    }
  });

  test("event payloads do not carry envelope metadata", () => {
    const { events } = buildHistory();
    for (const event of events) {
      const json = GroupChatEvent.toJSON(event) as unknown as Record<
        string,
        unknown
      >;
      expect(json.typeName).toEqual(event.typeName);
      for (const key of [
        "aggregateId",
        "aggregate_id",
        "sequenceNumber",
        "seq_nr",
        "occurredAt",
        "occurred_at",
        "isCreated",
      ]) {
        expect(json).not.toHaveProperty(key);
      }
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
    expect(Members.equals(restored.members, snapshot.members)).toEqual(true);
    expect(Messages.size(restored.messages)).toEqual(
      Messages.size(snapshot.messages),
    );
    const json = GroupChat.toJSON(snapshot) as unknown as Record<
      string,
      unknown
    >;
    expect(json).not.toHaveProperty("version");
    expect(json).not.toHaveProperty("manifest");
  });

  test("replaying events from history reconstructs the aggregate", () => {
    const { id, snapshot, events } = buildHistory();
    const records: GroupChatEventRecord[] = events.map((event, index) => ({
      event,
      seqNr: index + 1,
    }));
    const replayed = GroupChat.replayFromEvents(id, records);
    if (replayed === undefined) {
      throw new Error("replay returned undefined");
    }
    expect(replayed.id.value).toEqual(snapshot.id.value);
    expect(replayed.name.value).toEqual("renamed");
    expect(replayed.deleted).toEqual(true);
    expect(replayed.sequenceNumber).toEqual(snapshot.sequenceNumber);
  });
});
