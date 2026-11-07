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
 * ESA v5 serializes only the domain payload. Envelope metadata (aggregate id,
 * seq_nr, occurred_at, manifest) is carried separately by the event store, and
 * the manifest is `<event-type>@<schema-version>`. These serializers therefore
 * write pure domain JSON without `aggregateId`, `sequenceNumber`,
 * `occurredAt`, `isCreated`, or `version`.
 */
const groupChatEventSerializer: PayloadSerializer<GroupChatEvent> = {
  serialize(payload: GroupChatEvent): Uint8Array {
    return encoder.encode(JSON.stringify(GroupChatEvent.toJSON(payload)));
  },
  deserialize(bytes: Uint8Array, manifest: string): GroupChatEvent {
    const json = JSON.parse(decoder.decode(bytes));
    return convertJSONToGroupChatEvent(attachManifestType(json, manifest));
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
 * Payloads normally carry their own `typeName` discriminator. When a payload
 * drops it, the envelope manifest still identifies the event type so the same
 * decoder serves both shapes.
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
