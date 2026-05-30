import { Result } from "event-store-adapter-js";

const GROUP_CHAT_NAME_BRAND: unique symbol = Symbol("GroupChatName");

export type GroupChatNameJson = {
  value: string;
};

export type GroupChatName = {
  value: string;
  asString: () => string;
  readonly [GROUP_CHAT_NAME_BRAND]: true;
};

export namespace GroupChatName {
  export function of(value: string): GroupChatName {
    if (value.length === 0) {
      throw new Error("Group chat name cannot be empty");
    }
    if (value.length > 100) {
      throw new Error("Group chat name cannot be longer than 100 characters");
    }
    return Object.freeze({
      [GROUP_CHAT_NAME_BRAND]: true as const,
      value,
      asString: () => value,
    });
  }

  export function validate(value: string): Result<GroupChatName, string> {
    try {
      return Result.ok(of(value));
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  }

  export function equals(a: GroupChatName, b: GroupChatName): boolean {
    return a.value === b.value;
  }

  export function is(value: unknown): value is GroupChatName {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<GroupChatName>;
    return (
      candidate[GROUP_CHAT_NAME_BRAND] === true &&
      typeof candidate.value === "string"
    );
  }

  export function toJSON(value: GroupChatName): GroupChatNameJson {
    return { value: value.value };
  }

  export function fromJSON(json: unknown): GroupChatName {
    if (
      typeof json !== "object" ||
      json === null ||
      !("value" in json) ||
      typeof json.value !== "string"
    ) {
      throw new Error("Invalid GroupChatName JSON");
    }
    return of(json.value);
  }
}

export const convertJSONToGroupChatName = GroupChatName.fromJSON;
