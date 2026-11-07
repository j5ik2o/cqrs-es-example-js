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
  deserialize(bytes: Uint8Array, manifest: string): GroupChatEvent {
    return convertJSONToGroupChatEvent(
      attachManifestType(JSON.parse(decoder.decode(bytes)), manifest),
    );
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

/**
 * The current payloads carry their own `typeName`. When a future payload drops
 * the discriminator, the envelope's manifest (`<type>@<version>` or `<type>`)
 * still identifies the event type.
 */
function attachManifestType(json: unknown, manifest: string): unknown {
  if (typeof json !== "object" || json === null) {
    return json;
  }
  if ("type" in json || "typeName" in json) {
    return json;
  }
  const typeName = manifest.split("@")[0];
  return typeName === "" ? json : { ...json, typeName };
}

export { groupChatEventSerializer, groupChatSnapshotSerializer };
