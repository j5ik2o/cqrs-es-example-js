import * as U from "ulidx";
import * as E from "fp-ts/lib/Either";
const MessageIdTypeSymbol = Symbol("MessageId");

class MessageId {
  readonly symbol: typeof MessageIdTypeSymbol = MessageIdTypeSymbol;
  private readonly _value: string;
  private constructor(value: string) {
    if (U.isValid(value) === false) {
      throw new Error("Invalid message id");
    }
    this._value = value;
  }
  get value() {
    return this._value;
  }
  asString() {
    return this._value;
  }
  toString() {
    return `MessageId(${this._value})`;
  }
  equals(anotherId: MessageId): boolean {
    return this._value === anotherId.value;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToMessageId(json: any): MessageId {
    return new MessageId(json.value);
  }
}

export { MessageId, MessageIdTypeSymbol };
