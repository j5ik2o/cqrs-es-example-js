import { Message } from "./message";
import { MessageId } from "./message-id";
import * as O from "fp-ts/Option";

class Messages {
  private readonly _values: Map<string, Message>;
  constructor(values: Map<string, Message>) {
    this._values = values;
  }

  static ofSingle(message: Message): Messages {
    return new Messages(new Map([[message.id.asString, message]]));
  }

  static ofEmpty(): Messages {
    return new Messages(new Map());
  }

  static fromArray(messages: Message[]): Messages {
    return new Messages(
      new Map(messages.map((message) => [message.id.asString, message])),
    );
  }

  static fromMap(messages: Map<MessageId, Message>): Messages {
    return new Messages(
      new Map(Array.from(messages.entries()).map(([k, v]) => [k.asString, v])),
    );
  }

  addMessage(message: Message): Messages {
    return new Messages(
      new Map(this._values).set(message.id.asString, message),
    );
  }

  removeMessageById(messageId: MessageId): O.Option<[Messages, Message]> {
    const message = this._values.get(messageId.value);
    if (message === undefined) {
      return O.none;
    }
    const newMap = new Map(this._values);
    newMap.delete(messageId.value);
    return O.some([new Messages(newMap), message]);
  }

  containsById(messageId: MessageId): boolean {
    return this._values.has(messageId.value);
  }

  findById(messageId: MessageId): Message | undefined {
    return this._values.get(messageId.value);
  }

  toArray(): Message[] {
    return Array.from(this._values.values()).sort((a, b) =>
      a.id.value.localeCompare(b.id.value),
    );
  }

  toMap(): Map<MessageId, Message> {
    return new Map(
      Array.from(this._values.entries()).map(([k, v]) => [MessageId.of(k), v]),
    );
  }
}

export { Messages };
