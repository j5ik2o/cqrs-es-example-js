import { Message } from "./message";
import { MessageId } from "./message-id";
import * as O from "fp-ts/Option";

const MessagesTypeSymbol = Symbol("Messages");

class Messages {
  readonly symbol: typeof MessagesTypeSymbol = MessagesTypeSymbol;
  readonly _values: Map<string, Message>;
  constructor(values: Map<string, Message>) {
    this._values = values;
  }
  get values() {
    return this.toArray();
  }
  addMessage(message: Message) {
    return new Messages(
      new Map(this._values).set(message.id.asString(), message),
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
    return Array.from(this._values.values());
  }
  toMap(): Map<MessageId, Message> {
    return new Map(
      Array.from(this._values.entries()).map(([k, v]) => [MessageId.of(k), v]),
    );
  }
  size(): number {
    return this._values.size;
  }
  toString() {
    return `Messages(${JSON.stringify(this.toArray().map((m) => m.toString()))})`;
  }
  equals(anotherMessages: Messages) {
    return (
      this.size() === anotherMessages.size() &&
      this.toArray().every((message, index) =>
        message.equals(anotherMessages.toArray()[index]),
      )
    );
  }

  static ofEmpty(): Messages {
    return new Messages(new Map());
  }
  static ofSingle(message: Message): Messages {
    return new Messages(new Map([[message.id.asString(), message]]));
  }
  static fromArray(messages: Message[]): Messages {
    return new Messages(
      new Map(messages.map((message) => [message.id.asString(), message])),
    );
  }
  static fromMap(messages: Map<MessageId, Message>): Messages {
    return new Messages(
      new Map(
        Array.from(messages.entries()).map(([k, v]) => [k.asString(), v]),
      ),
    );
  }
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  static convertJSONToMessages(json: any): Messages {
    // console.log("convertJSONToMessages = ", obj);
    return Messages.fromArray(
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
      json.values.map((v: any) => Message.convertJSONToMessage(v)),
    );
  }
}

export { Messages, MessagesTypeSymbol };
