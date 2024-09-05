import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import * as E from "fp-ts/lib/Either";
import * as U from "ulidx";

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
      }
      throw error;
    }
  }

  static of(value: string): MessageId {
    return new MessageId(value);
  }

  static generate(): MessageId {
    return new MessageId(Infrastructure.generateULID());
  }
}

// biome-ignore lint/suspicious/noExplicitAny:
function convertJSONToMessageId(json: any): MessageId {
  return MessageId.of(json.value);
}

export { MessageId, MessageIdTypeSymbol, convertJSONToMessageId };
