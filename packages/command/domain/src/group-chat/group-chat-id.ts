import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import type { AggregateId } from "event-store-adapter-js/dist/aggregate-id";
import { Result } from "event-store-adapter-js/dist/result";
import * as U from "ulidx";

const GROUP_CHAT_PREFIX = "GroupChat";
const GROUP_CHAT_ID_BRAND: unique symbol = Symbol("GroupChatId");

export type GroupChatIdJson = {
  value: string;
};

export type GroupChatId = AggregateId & {
  typeName: typeof GROUP_CHAT_PREFIX;
  readonly [GROUP_CHAT_ID_BRAND]: true;
};

export namespace GroupChatId {
  export function of(value: string): GroupChatId {
    const ulid = value.startsWith(`${GROUP_CHAT_PREFIX}-`)
      ? value.substring(GROUP_CHAT_PREFIX.length + 1)
      : value;
    if (!U.isValid(ulid)) {
      throw new Error("Invalid group chat id");
    }
    return Object.freeze({
      [GROUP_CHAT_ID_BRAND]: true as const,
      typeName: GROUP_CHAT_PREFIX,
      value: ulid,
      asString: () => `${GROUP_CHAT_PREFIX}-${ulid}`,
    });
  }

  export function generate(): GroupChatId {
    return of(Infrastructure.generateULID());
  }

  export function validate(value: string): Result<GroupChatId, string> {
    try {
      return Result.ok(of(value));
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  }

  export function equals(a: GroupChatId, b: GroupChatId): boolean {
    return a.value === b.value;
  }

  export function is(value: unknown): value is GroupChatId {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<GroupChatId>;
    return (
      candidate[GROUP_CHAT_ID_BRAND] === true &&
      candidate.typeName === GROUP_CHAT_PREFIX &&
      typeof candidate.value === "string" &&
      typeof candidate.asString === "function"
    );
  }

  export function toJSON(value: GroupChatId): GroupChatIdJson {
    return { value: value.value };
  }

  export function fromJSON(json: unknown): GroupChatId {
    if (
      typeof json !== "object" ||
      json === null ||
      !("value" in json) ||
      typeof json.value !== "string"
    ) {
      throw new Error("Invalid GroupChatId JSON");
    }
    return of(json.value);
  }
}

export const convertJSONToGroupChatId = GroupChatId.fromJSON;
