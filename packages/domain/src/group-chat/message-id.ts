import { ulid } from "ulidx";

const MessageIdSymbol = Symbol("MessageId");

class MessageId {
  readonly symbol: typeof MessageIdSymbol = MessageIdSymbol;

  private constructor(public readonly value: string) {}

  static of(value: string): MessageId {
    return new MessageId(value);
  }

  static generate(): MessageId {
    return new MessageId(ulid());
  }

  get asString(): string {
    return this.value;
  }
}

export { MessageId };
