import { convertJSONToMessage, Message } from "./message";
import { MessageId } from "./message-id";
import * as O from "fp-ts/Option";

const MessagesTypeSymbol = Symbol("Messages");

class Messages {
  readonly symbol: typeof MessagesTypeSymbol = MessagesTypeSymbol;
  constructor(public readonly values: Map<string, Message>) {
    this.values = values;
  }

  toJSON() {
    return {
      values: this.toArray().map((m) => m.toJSON()),
    };
  }

  addMessage(message: Message) {
    return new Messages(
      new Map(this.values).set(message.id.asString(), message),
    );
  }

  removeMessageById(messageId: MessageId): O.Option<[Messages, Message]> {
    const message = this.values.get(messageId.value);
    if (message === undefined) {
      return O.none;
    }
    const newMap = new Map(this.values);
    newMap.delete(messageId.value);
    return O.some([new Messages(newMap), message]);
  }

  containsById(messageId: MessageId): boolean {
    return this.values.has(messageId.value);
  }

  findById(messageId: MessageId): Message | undefined {
    return this.values.get(messageId.value);
  }

  toArray(): Message[] {
    return Array.from(this.values.values());
  }

  toMap(): Map<MessageId, Message> {
    return new Map(
      Array.from(this.values.entries()).map(([k, v]) => [MessageId.of(k), v]),
    );
  }

  size(): number {
    return this.values.size;
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
}
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
function convertJSONToMessages(json: any): Messages {
  // console.log("convertJSONToMessages = ", obj);
  return Messages.fromArray(
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    json.values.map((v: any) => convertJSONToMessage(v)),
  );
}
export { Messages, MessagesTypeSymbol, convertJSONToMessages };
