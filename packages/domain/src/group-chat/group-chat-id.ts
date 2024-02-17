import { ulid } from "ulidx";
import { AggregateId } from "event-store-adapter-js";

const GROUP_CHAT_PREFIX: string = "GroupChat";
const GroupChatIdSymbol = Symbol("GroupChatId");

class GroupChatId implements AggregateId {
  readonly symbol: typeof GroupChatIdSymbol = GroupChatIdSymbol;

  private readonly _value: string;

  private constructor(value?: string) {
    if (value === undefined) {
      this._value = ulid();
    } else {
      if (value.startsWith(GROUP_CHAT_PREFIX + "-")) {
        value = value.substring(GROUP_CHAT_PREFIX.length + 1);
      }
      this._value = value;
    }
  }

  static of(value: string): GroupChatId {
    return new GroupChatId(value);
  }

  static generate(): GroupChatId {
    return new GroupChatId();
  }

  get asString(): string {
    return `${this.typeName}-${this._value}`;
  }

  get value(): string {
    return this._value;
  }

  get typeName(): string {
    return GROUP_CHAT_PREFIX;
  }

  equals(anotherId: GroupChatId): boolean {
    return this.value === anotherId.value;
  }
}

export { GroupChatId };
