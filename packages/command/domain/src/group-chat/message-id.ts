import * as U from "ulidx";
import * as E from "fp-ts/lib/Either";
const MessageIdTypeSymbol = Symbol("MessageId");

class MessageId {
  readonly symbol: typeof MessageIdTypeSymbol = MessageIdTypeSymbol;
  private constructor(public readonly value: string) {
    if (!U.isValid(value)) {
      throw new Error("Invalid message id");
    }
  }

  toJSON() {
    return {
      value: this.value,
    };
  }

  asString() {
    return this.value;
  }
  toString() {
    return `MessageId(${this.value})`;
  }
  equals(anotherId: MessageId): boolean {
    return this.value === anotherId.value;
  }

  static validate(value: string): E.Either<string, MessageId> {
    try {
      return E.right(new MessageId(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  }
  static of(value: string): MessageId {
    return new MessageId(value);
  }
  static generate(): MessageId {
    return new MessageId(U.ulid());
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMessageId(json: any): MessageId {
  return MessageId.of(json.value);
}

export { MessageId, MessageIdTypeSymbol, convertJSONToMessageId };
