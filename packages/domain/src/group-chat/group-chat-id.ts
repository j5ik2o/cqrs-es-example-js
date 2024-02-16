import { ulid } from "ulidx";
import { AggregateId } from "event-store-adapter-js";

const GROUP_CHAT_PREFIX: string = "GroupChat";
const GroupChatIdSymbol = Symbol("GroupChatId");

class GroupChatId implements AggregateId {
  readonly symbol: typeof GroupChatIdSymbol = GroupChatIdSymbol;

  private _value: string;
  constructor(value?: string) {
    if (value === undefined) {
      this._value = ulid();
    } else {
      if (value.startsWith(GROUP_CHAT_PREFIX + "-")) {
        value = value.substring(GROUP_CHAT_PREFIX.length + 1);
      }
      this._value = value;
    }
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
}

export { GroupChatId };
