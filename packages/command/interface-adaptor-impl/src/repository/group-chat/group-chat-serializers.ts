import {
  GroupChat,
  GroupChatEvent,
  convertJSONToGroupChat,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import type { PayloadSerializer } from "event-store-adapter-js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * ESA v5 serializes only the domain payload; envelope metadata (aggregate id,
 * seq_nr, occurred_at, manifest) is carried separately. These serializers keep
 * the existing domain JSON representation so the event payloads remain
 * readable by the current code while the store moves to the envelope API.
 */
const groupChatEventSerializer: PayloadSerializer<GroupChatEvent> = {
  serialize(payload: GroupChatEvent): Uint8Array {
    return encoder.encode(JSON.stringify(GroupChatEvent.toJSON(payload)));
  },
  deserialize(bytes: Uint8Array): GroupChatEvent {
    return convertJSONToGroupChatEvent(JSON.parse(decoder.decode(bytes)));
  },
};

const groupChatSnapshotSerializer: PayloadSerializer<GroupChat> = {
  serialize(payload: GroupChat): Uint8Array {
    return encoder.encode(JSON.stringify(GroupChat.toJSON(payload)));
  },
  deserialize(bytes: Uint8Array): GroupChat {
    return convertJSONToGroupChat(JSON.parse(decoder.decode(bytes)));
  },
};

export { groupChatEventSerializer, groupChatSnapshotSerializer };
