import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import type { Event } from "event-store-adapter-js";
import {
  type UserAccountId,
  type UserAccountIdJson,
  convertJSONToUserAccountId,
} from "../user-account";
import {
  type GroupChatId,
  type GroupChatIdJson,
  convertJSONToGroupChatId,
} from "./group-chat-id";
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
const GROUP_CHAT_MESSAGE_DELETED_BRAND: unique symbol = Symbol(
  "GroupChatMessageDeleted",
);
const GROUP_CHAT_DELETED_BRAND: unique symbol = Symbol("GroupChatDeleted");

// --- Common shape ---------------------------------------------------------

type GroupChatEventBase = Event<GroupChatId> & {
  executorId: UserAccountId;
};

type GroupChatEventBaseJson = {
  id: string;
  aggregateId: GroupChatIdJson;
  executorId: UserAccountIdJson;
  sequenceNumber: number;
  occurredAt: string;
  isCreated: boolean;
};

function baseFields(input: {
  id: string;
  aggregateId: GroupChatId;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
}): GroupChatEventBase {
  requireNonEmptyString("event id", input.id);
  requireSequenceNumber(input.sequenceNumber);
  requireValidDate(input.occurredAt);
  return {
    id: input.id,
    aggregateId: input.aggregateId,
    executorId: input.executorId,
    sequenceNumber: input.sequenceNumber,
    occurredAt: input.occurredAt,
  } as GroupChatEventBase;
}

function baseToJSON(
  event: GroupChatEventBase & { isCreated: boolean },
): GroupChatEventBaseJson {
  return {
    id: event.id,
    aggregateId: { value: event.aggregateId.value },
    executorId: { value: event.executorId.value },
    sequenceNumber: event.sequenceNumber,
    occurredAt: event.occurredAt.toISOString(),
    isCreated: event.isCreated,
  };
}

function baseFromJSON(json: GroupChatEventDataJson): {
  id: string;
  aggregateId: GroupChatId;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
} {
  return {
    id: String(json.id),
    aggregateId: convertJSONToGroupChatId(json.aggregateId),
    executorId: convertJSONToUserAccountId(json.executorId),
    sequenceNumber: Number(json.sequenceNumber),
    occurredAt: new Date(String(json.occurredAt)),
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
  isCreated: true;
  name: GroupChatName;
  members: Members;
  readonly [GROUP_CHAT_CREATED_BRAND]: true;
};

export namespace GroupChatCreated {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    name: GroupChatName;
    members: Members;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatCreated {
    return Object.freeze({
      [GROUP_CHAT_CREATED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatCreated",
      isCreated: true,
      name: input.name,
      members: input.members,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatCreated {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      name,
      members,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  isCreated: false;
  name: GroupChatName;
  readonly [GROUP_CHAT_RENAMED_BRAND]: true;
};

export namespace GroupChatRenamed {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    name: GroupChatName;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatRenamed {
    return Object.freeze({
      [GROUP_CHAT_RENAMED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatRenamed",
      isCreated: false,
      name: input.name,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatRenamed {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      name,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  isCreated: false;
  member: Member;
  readonly [GROUP_CHAT_MEMBER_ADDED_BRAND]: true;
};

export namespace GroupChatMemberAdded {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    member: Member;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatMemberAdded {
    return Object.freeze({
      [GROUP_CHAT_MEMBER_ADDED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMemberAdded",
      isCreated: false,
      member: input.member,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberAdded {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      member,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  isCreated: false;
  member: Member;
  readonly [GROUP_CHAT_MEMBER_REMOVED_BRAND]: true;
};

export namespace GroupChatMemberRemoved {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    member: Member;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatMemberRemoved {
    return Object.freeze({
      [GROUP_CHAT_MEMBER_REMOVED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMemberRemoved",
      isCreated: false,
      member: input.member,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberRemoved {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      member,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  isCreated: false;
  message: Message;
  readonly [GROUP_CHAT_MESSAGE_POSTED_BRAND]: true;
};

export namespace GroupChatMessagePosted {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    message: Message;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatMessagePosted {
    return Object.freeze({
      [GROUP_CHAT_MESSAGE_POSTED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMessagePosted",
      isCreated: false,
      message: input.message,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessagePosted {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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

// --- GroupChatMessageDeleted ----------------------------------------------

export type GroupChatMessageDeletedJson = GroupChatEventBaseJson & {
  typeName: "GroupChatMessageDeleted";
  message: MessageJson;
};

export type GroupChatMessageDeleted = GroupChatEventBase & {
  typeName: "GroupChatMessageDeleted";
  isCreated: false;
  message: Message;
  readonly [GROUP_CHAT_MESSAGE_DELETED_BRAND]: true;
};

export namespace GroupChatMessageDeleted {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    message: Message;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatMessageDeleted {
    return Object.freeze({
      [GROUP_CHAT_MESSAGE_DELETED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatMessageDeleted",
      isCreated: false,
      message: input.message,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessageDeleted {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  isCreated: false;
  readonly [GROUP_CHAT_DELETED_BRAND]: true;
};

export namespace GroupChatDeleted {
  export function create(input: {
    id: string;
    aggregateId: GroupChatId;
    executorId: UserAccountId;
    sequenceNumber: number;
    occurredAt: Date;
  }): GroupChatDeleted {
    return Object.freeze({
      [GROUP_CHAT_DELETED_BRAND]: true as const,
      ...baseFields(input),
      typeName: "GroupChatDeleted",
      isCreated: false,
    });
  }

  export function of(
    aggregateId: GroupChatId,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatDeleted {
    return create({
      id: Infrastructure.generateULID(),
      aggregateId,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
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
  | GroupChatMessageDeleted
  | GroupChatDeleted;

export type GroupChatEventJson =
  | GroupChatCreatedJson
  | GroupChatRenamedJson
  | GroupChatMemberAddedJson
  | GroupChatMemberRemovedJson
  | GroupChatMessagePostedJson
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
  // Serializer envelope: { type, data }
  if ("type" in json && "data" in json) {
    return { typeName: String(json.type), data: json.data };
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

function requireSequenceNumber(value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("event sequenceNumber must be a non-negative safe integer");
  }
}

function requireValidDate(value: unknown): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("event occurredAt must be a valid Date");
  }
}
