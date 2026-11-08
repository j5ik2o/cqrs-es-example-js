import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import {
  type UserAccountId,
  type UserAccountIdJson,
  convertJSONToUserAccountId,
} from "../user-account";
import {
  type GroupChatName,
  type GroupChatNameJson,
  convertJSONToGroupChatName,
} from "./group-chat-name";
import { Member, type MemberJson, convertJSONToMember } from "./member";
import {
  type Members,
  type MembersJson,
  convertJSONToMembers,
} from "./members";
import { Message, type MessageJson, convertJSONToMessage } from "./message";

// --- Envelope manifest ----------------------------------------------------

/**
 * Payload schema version carried in the ESA v5 envelope manifest. The manifest
 * is `<event-type>@<schema-version>`; the payload itself contains no envelope
 * metadata (aggregate id, sequence number, occurrence time).
 */
export const EVENT_SCHEMA_VERSION = 1;

export function manifestOf(eventType: string): string {
  return `${eventType}@${EVENT_SCHEMA_VERSION}`;
}

// --- Brands ---------------------------------------------------------------

const GROUP_CHAT_CREATED_BRAND: unique symbol = Symbol("GroupChatCreated");
const GROUP_CHAT_RENAMED_BRAND: unique symbol = Symbol("GroupChatRenamed");
const GROUP_CHAT_MEMBER_ADDED_BRAND: unique symbol = Symbol(
  "GroupChatMemberAdded",
);
const GROUP_CHAT_MEMBER_REMOVED_BRAND: unique symbol = Symbol(
  "GroupChatMemberRemoved",
);
const GROUP_CHAT_MESSAGE_POSTED_BRAND: unique symbol = Symbol(
  "GroupChatMessagePosted",
);
const GROUP_CHAT_MESSAGE_EDITED_BRAND: unique symbol = Symbol(
  "GroupChatMessageEdited",
);
const GROUP_CHAT_MESSAGE_DELETED_BRAND: unique symbol = Symbol(
  "GroupChatMessageDeleted",
);
const GROUP_CHAT_DELETED_BRAND: unique symbol = Symbol("GroupChatDeleted");

// --- Common shape ---------------------------------------------------------

type GroupChatEventBase = {
  typeName: string;
  id: string;
  executorId: UserAccountId;
};

type GroupChatEventBaseJson = {
  id: string;
  executorId: UserAccountIdJson;
};

function baseFields(input: {
  id: string;
  executorId: UserAccountId;
}): GroupChatEventBase {
  requireNonEmptyString("event id", input.id);
  return {
    id: input.id,
    executorId: input.executorId,
  } as GroupChatEventBase;
}

function baseToJSON(event: GroupChatEventBase): GroupChatEventBaseJson {
  return {
    id: event.id,
    executorId: { value: event.executorId.value },
  };
}

function baseFromJSON(json: GroupChatEventDataJson): {
  id: string;
  executorId: UserAccountId;
} {
  // Reject corrupt payloads explicitly rather than coercing (e.g. a missing id
  // must not become the string "undefined" and pass validation downstream).
  if (typeof json.id !== "string") {
    throw new Error("Invalid GroupChatEvent JSON: id must be a string");
  }
  if (json.id === "") {
    throw new Error("Invalid GroupChatEvent JSON: id must not be empty");
  }
  return {
    id: json.id,
    executorId: convertJSONToUserAccountId(json.executorId),
  };
}

// --- GroupChatCreated -----------------------------------------------------

export type GroupChatCreatedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatCreated";
  name: GroupChatNameJson;
  members: MembersJson;
};

export type GroupChatCreated = GroupChatEventBase & {
  typeName: "GroupChatCreated";
  name: GroupChatName;
  members: Members;
  readonly [GROUP_CHAT_CREATED_BRAND]: true;
};

export namespace GroupChatCreated {
  export function create(input: {
    id: string;
    name: GroupChatName;
    members: Members;
    executorId: UserAccountId;
  }): GroupChatCreated {
    return Object.freeze({
      [GROUP_CHAT_CREATED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatCreated",
      name: input.name,
      members: input.members,
    });
  }

  export function of(
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
  ): GroupChatCreated {
    return create({
      id: Infrastructure.generateULID(),
      name,
      members,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatCreated {
    return brandOf(value) === GROUP_CHAT_CREATED_BRAND;
  }

  export function toJSON(event: GroupChatCreated): GroupChatCreatedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatCreated",
      name: { value: event.name.value },
      members: { values: event.members.values.map((m) => Member.toJSON(m)) },
    };
  }

  export function fromJSON(json: GroupChatEventDataJson): GroupChatCreated {
    return create({
      ...baseFromJSON(json),
      name: convertJSONToGroupChatName(json.name),
      members: convertJSONToMembers(json.members),
    });
  }
}

// --- GroupChatRenamed -----------------------------------------------------

export type GroupChatRenamedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatRenamed";
  name: GroupChatNameJson;
};

export type GroupChatRenamed = GroupChatEventBase & {
  typeName: "GroupChatRenamed";
  name: GroupChatName;
  readonly [GROUP_CHAT_RENAMED_BRAND]: true;
};

export namespace GroupChatRenamed {
  export function create(input: {
    id: string;
    name: GroupChatName;
    executorId: UserAccountId;
  }): GroupChatRenamed {
    return Object.freeze({
      [GROUP_CHAT_RENAMED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatRenamed",
      name: input.name,
    });
  }

  export function of(
    name: GroupChatName,
    executorId: UserAccountId,
  ): GroupChatRenamed {
    return create({
      id: Infrastructure.generateULID(),
      name,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatRenamed {
    return brandOf(value) === GROUP_CHAT_RENAMED_BRAND;
  }

  export function toJSON(event: GroupChatRenamed): GroupChatRenamedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatRenamed",
      name: { value: event.name.value },
    };
  }

  export function fromJSON(json: GroupChatEventDataJson): GroupChatRenamed {
    return create({
      ...baseFromJSON(json),
      name: convertJSONToGroupChatName(json.name),
    });
  }
}

// --- GroupChatMemberAdded -------------------------------------------------

export type GroupChatMemberAddedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMemberAdded";
  member: MemberJson;
};

export type GroupChatMemberAdded = GroupChatEventBase & {
  typeName: "GroupChatMemberAdded";
  member: Member;
  readonly [GROUP_CHAT_MEMBER_ADDED_BRAND]: true;
};

export namespace GroupChatMemberAdded {
  export function create(input: {
    id: string;
    member: Member;
    executorId: UserAccountId;
  }): GroupChatMemberAdded {
    return Object.freeze({
      [GROUP_CHAT_MEMBER_ADDED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMemberAdded",
      member: input.member,
    });
  }

  export function of(
    member: Member,
    executorId: UserAccountId,
  ): GroupChatMemberAdded {
    return create({
      id: Infrastructure.generateULID(),
      member,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatMemberAdded {
    return brandOf(value) === GROUP_CHAT_MEMBER_ADDED_BRAND;
  }

  export function toJSON(
    event: GroupChatMemberAdded,
  ): GroupChatMemberAddedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatMemberAdded",
      member: Member.toJSON(event.member),
    };
  }

  export function fromJSON(json: GroupChatEventDataJson): GroupChatMemberAdded {
    return create({
      ...baseFromJSON(json),
      member: convertJSONToMember(json.member),
    });
  }
}

// --- GroupChatMemberRemoved -----------------------------------------------

export type GroupChatMemberRemovedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMemberRemoved";
  member: MemberJson;
};

export type GroupChatMemberRemoved = GroupChatEventBase & {
  typeName: "GroupChatMemberRemoved";
  member: Member;
  readonly [GROUP_CHAT_MEMBER_REMOVED_BRAND]: true;
};

export namespace GroupChatMemberRemoved {
  export function create(input: {
    id: string;
    member: Member;
    executorId: UserAccountId;
  }): GroupChatMemberRemoved {
    return Object.freeze({
      [GROUP_CHAT_MEMBER_REMOVED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMemberRemoved",
      member: input.member,
    });
  }

  export function of(
    member: Member,
    executorId: UserAccountId,
  ): GroupChatMemberRemoved {
    return create({
      id: Infrastructure.generateULID(),
      member,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatMemberRemoved {
    return brandOf(value) === GROUP_CHAT_MEMBER_REMOVED_BRAND;
  }

  export function toJSON(
    event: GroupChatMemberRemoved,
  ): GroupChatMemberRemovedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatMemberRemoved",
      member: Member.toJSON(event.member),
    };
  }

  export function fromJSON(
    json: GroupChatEventDataJson,
  ): GroupChatMemberRemoved {
    return create({
      ...baseFromJSON(json),
      member: convertJSONToMember(json.member),
    });
  }
}

// --- GroupChatMessagePosted -----------------------------------------------

export type GroupChatMessagePostedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMessagePosted";
  message: MessageJson;
};

export type GroupChatMessagePosted = GroupChatEventBase & {
  typeName: "GroupChatMessagePosted";
  message: Message;
  readonly [GROUP_CHAT_MESSAGE_POSTED_BRAND]: true;
};

export namespace GroupChatMessagePosted {
  export function create(input: {
    id: string;
    message: Message;
    executorId: UserAccountId;
  }): GroupChatMessagePosted {
    return Object.freeze({
      [GROUP_CHAT_MESSAGE_POSTED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMessagePosted",
      message: input.message,
    });
  }

  export function of(
    message: Message,
    executorId: UserAccountId,
  ): GroupChatMessagePosted {
    return create({
      id: Infrastructure.generateULID(),
      message,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatMessagePosted {
    return brandOf(value) === GROUP_CHAT_MESSAGE_POSTED_BRAND;
  }

  export function toJSON(
    event: GroupChatMessagePosted,
  ): GroupChatMessagePostedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatMessagePosted",
      message: Message.toJSON(event.message),
    };
  }

  export function fromJSON(
    json: GroupChatEventDataJson,
  ): GroupChatMessagePosted {
    return create({
      ...baseFromJSON(json),
      message: convertJSONToMessage(json.message),
    });
  }
}

// --- GroupChatMessageEdited -----------------------------------------------

export type GroupChatMessageEditedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMessageEdited";
  message: MessageJson;
};

export type GroupChatMessageEdited = GroupChatEventBase & {
  typeName: "GroupChatMessageEdited";
  message: Message;
  readonly [GROUP_CHAT_MESSAGE_EDITED_BRAND]: true;
};

export namespace GroupChatMessageEdited {
  export function create(input: {
    id: string;
    message: Message;
    executorId: UserAccountId;
  }): GroupChatMessageEdited {
    return Object.freeze({
      [GROUP_CHAT_MESSAGE_EDITED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMessageEdited",
      message: input.message,
    });
  }

  export function of(
    message: Message,
    executorId: UserAccountId,
  ): GroupChatMessageEdited {
    return create({
      id: Infrastructure.generateULID(),
      message,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatMessageEdited {
    return brandOf(value) === GROUP_CHAT_MESSAGE_EDITED_BRAND;
  }

  export function toJSON(
    event: GroupChatMessageEdited,
  ): GroupChatMessageEditedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatMessageEdited",
      message: Message.toJSON(event.message),
    };
  }

  export function fromJSON(
    json: GroupChatEventDataJson,
  ): GroupChatMessageEdited {
    return create({
      ...baseFromJSON(json),
      message: convertJSONToMessage(json.message),
    });
  }
}

// --- GroupChatMessageDeleted ----------------------------------------------

export type GroupChatMessageDeletedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMessageDeleted";
  message: MessageJson;
};

export type GroupChatMessageDeleted = GroupChatEventBase & {
  typeName: "GroupChatMessageDeleted";
  message: Message;
  readonly [GROUP_CHAT_MESSAGE_DELETED_BRAND]: true;
};

export namespace GroupChatMessageDeleted {
  export function create(input: {
    id: string;
    message: Message;
    executorId: UserAccountId;
  }): GroupChatMessageDeleted {
    return Object.freeze({
      [GROUP_CHAT_MESSAGE_DELETED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMessageDeleted",
      message: input.message,
    });
  }

  export function of(
    message: Message,
    executorId: UserAccountId,
  ): GroupChatMessageDeleted {
    return create({
      id: Infrastructure.generateULID(),
      message,
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatMessageDeleted {
    return brandOf(value) === GROUP_CHAT_MESSAGE_DELETED_BRAND;
  }

  export function toJSON(
    event: GroupChatMessageDeleted,
  ): GroupChatMessageDeletedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatMessageDeleted",
      message: Message.toJSON(event.message),
    };
  }

  export function fromJSON(
    json: GroupChatEventDataJson,
  ): GroupChatMessageDeleted {
    return create({
      ...baseFromJSON(json),
      message: convertJSONToMessage(json.message),
    });
  }
}

// --- GroupChatDeleted -----------------------------------------------------

export type GroupChatDeletedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatDeleted";
};

export type GroupChatDeleted = GroupChatEventBase & {
  typeName: "GroupChatDeleted";
  readonly [GROUP_CHAT_DELETED_BRAND]: true;
};

export namespace GroupChatDeleted {
  export function create(input: {
    id: string;
    executorId: UserAccountId;
  }): GroupChatDeleted {
    return Object.freeze({
      [GROUP_CHAT_DELETED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatDeleted",
    });
  }

  export function of(executorId: UserAccountId): GroupChatDeleted {
    return create({
      id: Infrastructure.generateULID(),
      executorId,
    });
  }

  export function is(value: unknown): value is GroupChatDeleted {
    return brandOf(value) === GROUP_CHAT_DELETED_BRAND;
  }

  export function toJSON(event: GroupChatDeleted): GroupChatDeletedJson {
    return {
      ...baseToJSON(event),
      typeName: "GroupChatDeleted",
    };
  }

  export function fromJSON(json: GroupChatEventDataJson): GroupChatDeleted {
    return create(baseFromJSON(json));
  }
}

// --- Union ----------------------------------------------------------------

export type GroupChatEvent =
  | GroupChatCreated
  | GroupChatRenamed
  | GroupChatMemberAdded
  | GroupChatMemberRemoved
  | GroupChatMessagePosted
  | GroupChatMessageEdited
  | GroupChatMessageDeleted
  | GroupChatDeleted;

export type GroupChatEventJson =
  | GroupChatCreatedJson
  | GroupChatRenamedJson
  | GroupChatMemberAddedJson
  | GroupChatMemberRemovedJson
  | GroupChatMessagePostedJson
  | GroupChatMessageEditedJson
  | GroupChatMessageDeletedJson
  | GroupChatDeletedJson;

export namespace GroupChatEvent {
  export function is(value: unknown): value is GroupChatEvent {
    return (
      GroupChatCreated.is(value) ||
      GroupChatRenamed.is(value) ||
      GroupChatMemberAdded.is(value) ||
      GroupChatMemberRemoved.is(value) ||
      GroupChatMessagePosted.is(value) ||
      GroupChatMessageEdited.is(value) ||
      GroupChatMessageDeleted.is(value) ||
      GroupChatDeleted.is(value)
    );
  }

  export function toJSON(event: GroupChatEvent): GroupChatEventJson {
    switch (event.typeName) {
      case "GroupChatCreated":
        return GroupChatCreated.toJSON(event);
      case "GroupChatRenamed":
        return GroupChatRenamed.toJSON(event);
      case "GroupChatMemberAdded":
        return GroupChatMemberAdded.toJSON(event);
      case "GroupChatMemberRemoved":
        return GroupChatMemberRemoved.toJSON(event);
      case "GroupChatMessagePosted":
        return GroupChatMessagePosted.toJSON(event);
      case "GroupChatMessageEdited":
        return GroupChatMessageEdited.toJSON(event);
      case "GroupChatMessageDeleted":
        return GroupChatMessageDeleted.toJSON(event);
      case "GroupChatDeleted":
        return GroupChatDeleted.toJSON(event);
      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown GroupChatEvent: ${String(exhaustive)}`);
      }
    }
  }

  export function fromJSON(json: unknown): GroupChatEvent {
    const { typeName, data } = unwrapEvent(json);
    switch (typeName) {
      case "GroupChatCreated":
        return GroupChatCreated.fromJSON(data);
      case "GroupChatRenamed":
        return GroupChatRenamed.fromJSON(data);
      case "GroupChatMemberAdded":
        return GroupChatMemberAdded.fromJSON(data);
      case "GroupChatMemberRemoved":
        return GroupChatMemberRemoved.fromJSON(data);
      case "GroupChatMessagePosted":
        return GroupChatMessagePosted.fromJSON(data);
      case "GroupChatMessageEdited":
        return GroupChatMessageEdited.fromJSON(data);
      case "GroupChatMessageDeleted":
        return GroupChatMessageDeleted.fromJSON(data);
      case "GroupChatDeleted":
        return GroupChatDeleted.fromJSON(data);
      default:
        throw new Error(`Unknown GroupChatEvent type: ${String(typeName)}`);
    }
  }
}

export const convertJSONToGroupChatEvent = GroupChatEvent.fromJSON;

// --- Internal helpers -----------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON payload from the event store
type GroupChatEventDataJson = any;

function unwrapEvent(json: unknown): {
  typeName: string;
  data: GroupChatEventDataJson;
} {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid GroupChatEvent JSON");
  }
  // Legacy serializer envelope: { type, data }. Kept only so payloads written
  // before the v5 migration can still be read; new payloads carry typeName.
  if ("type" in json && "data" in json) {
    const data = json.data;
    if (typeof data === "object" && data !== null && !("typeName" in data)) {
      return {
        typeName: String(json.type),
        data: { ...data, typeName: json.type },
      };
    }
    return { typeName: String(json.type), data };
  }
  // Raw event object with a typeName discriminator.
  if ("typeName" in json) {
    return { typeName: String(json.typeName), data: json };
  }
  throw new Error("Invalid GroupChatEvent JSON");
}

function brandOf(value: unknown): symbol | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  for (const brand of [
    GROUP_CHAT_CREATED_BRAND,
    GROUP_CHAT_RENAMED_BRAND,
    GROUP_CHAT_MEMBER_ADDED_BRAND,
    GROUP_CHAT_MEMBER_REMOVED_BRAND,
    GROUP_CHAT_MESSAGE_POSTED_BRAND,
    GROUP_CHAT_MESSAGE_EDITED_BRAND,
    GROUP_CHAT_MESSAGE_DELETED_BRAND,
    GROUP_CHAT_DELETED_BRAND,
  ]) {
    if ((value as Record<symbol, unknown>)[brand] === true) {
      return brand;
    }
  }
  return undefined;
}

function requireNonEmptyString(fieldName: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}
