import * as U from "ulidx";
import * as E from "fp-ts/lib/Either";
import { AggregateId } from "event-store-adapter-js";
const GROUP_CHAT_PREFIX: string = "GroupChat";
const GroupChatIdTypeSymbol = Symbol("GroupChatId");

class GroupChatId implements AggregateId {
  readonly symbol: typeof GroupChatIdTypeSymbol = GroupChatIdTypeSymbol;
  readonly typeName = GROUP_CHAT_PREFIX;

  typName = "GroupChatId";
  private readonly _value: string;
  private constructor(value?: string) {
    this._value = GroupChatId.initializeValue(value);
  }

  get value(): string {
    return this._value;
  }

  private static initializeValue(value?: string): string {
    if (value === undefined) {
      return U.ulid();
    } else {
      const ulid = value.startsWith(GROUP_CHAT_PREFIX + "-")
        ? value.substring(GROUP_CHAT_PREFIX.length + 1)
        : value;
      if (U.isValid(ulid)) {
        return ulid;
      } else {
        throw new Error("Invalid group chat id");
      }
    }
  }
  equals(anotherId: GroupChatId): boolean {
    return this._value === anotherId._value;
  }
  asString() {
    return `${GROUP_CHAT_PREFIX}-${this._value}`;
  }
  toString() {
    return `GroupChatId(${this._value})`;
  }

  static validate(value: string): E.Either<string, GroupChatId> {
    try {
      return E.right(GroupChatId.of(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  }

  static of(value: string): GroupChatId {
    return new GroupChatId(value);
  }

  static generate(): GroupChatId {
    return new GroupChatId();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToGroupChatId(json: any): GroupChatId {
    return GroupChatId.of(json.value);
  }
}

export { GroupChatId, GroupChatIdTypeSymbol };
