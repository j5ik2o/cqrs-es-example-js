import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import type { AggregateId } from "event-store-adapter-js";
import * as E from "fp-ts/lib/Either";
import * as U from "ulidx";

const GROUP_CHAT_PREFIX: string = "GroupChat";
const GroupChatIdTypeSymbol = Symbol("GroupChatId");

class GroupChatId implements AggregateId {
  readonly symbol: typeof GroupChatIdTypeSymbol = GroupChatIdTypeSymbol;
  readonly typeName = GROUP_CHAT_PREFIX;

  private constructor(public readonly value: string) {}

  toJSON() {
    return {
      value: this.value,
    };
  }

  equals(anotherId: GroupChatId): boolean {
    return this.value === anotherId.value;
  }
  asString() {
    return `${GROUP_CHAT_PREFIX}-${this.value}`;
  }
  toString() {
    return `GroupChatId(${this.value})`;
  }

  static validate(value: string): E.Either<string, GroupChatId> {
    try {
      return E.right(GroupChatId.of(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      }
      throw error;
    }
  }

  static of(value: string): GroupChatId {
    const ulid = value.startsWith(`${GROUP_CHAT_PREFIX}-`)
      ? value.substring(GROUP_CHAT_PREFIX.length + 1)
      : value;
    if (U.isValid(ulid)) {
      return new GroupChatId(ulid);
    }
    throw new Error("Invalid group chat id");
  }

  static generate(): GroupChatId {
    return new GroupChatId(Infrastructure.generateULID());
  }
}

// biome-ignore lint/suspicious/noExplicitAny:
function convertJSONToGroupChatId(json: any): GroupChatId {
  return GroupChatId.of(json.value);
}

export { GroupChatId, GroupChatIdTypeSymbol, convertJSONToGroupChatId };
