import { convertJSONToMessage, Message } from "./message";
import { MessageId } from "./message-id";
import * as O from "fp-ts/Option";

const MessagesTypeSymbol = Symbol("Messages");

interface Messages {
  symbol: typeof MessagesTypeSymbol;
  values: Message[];
  addMessage: (message: Message) => Messages;
  removeMessageById: (messageId: MessageId) => O.Option<[Messages, Message]>;
  containsById: (messageId: MessageId) => boolean;
  findById: (messageId: MessageId) => Message | undefined;
  toArray: () => Message[];
  toMap: () => Map<MessageId, Message>;
  size: () => number;
  equals: (anotherMessages: Messages) => boolean;
}

function initialize(values: Map<string, Message>): Messages {
  let _toArray: Message[] | undefined = undefined;
  let _toMap: Map<MessageId, Message> | undefined = undefined;
  return {
    symbol: MessagesTypeSymbol,
    get values() {
      return this.toArray();
    },
    addMessage: (message: Message) =>
      initialize(new Map(values).set(message.id.asString, message)),
    removeMessageById: (
      messageId: MessageId,
    ): O.Option<[Messages, Message]> => {
      const message = values.get(messageId.value);
      if (message === undefined) {
        return O.none;
      }
      const newMap = new Map(values);
      newMap.delete(messageId.value);
      return O.some([initialize(newMap), message]);
    },
    containsById: (messageId: MessageId) => values.has(messageId.value),
    findById: (messageId: MessageId) => values.get(messageId.value),
    toArray() {
      if (_toArray === undefined) {
        _toArray = Array.from(values.values());
      }
      return _toArray;
    },
    toMap() {
      if (_toMap === undefined) {
        _toMap = new Map(
          Array.from(values.entries()).map(([k, v]) => [MessageId.of(k), v]),
        );
      }
      return _toMap;
    },
    size: () => values.size,
    equals(anotherMessages: Messages) {
      return (
        this.size() === anotherMessages.size() &&
        this.toArray().every((message, index) =>
          message.equals(anotherMessages.toArray()[index]),
        )
      );
    },
  };
}

const Messages = {
  ofEmpty(): Messages {
    return initialize(new Map());
  },
  ofSingle(message: Message): Messages {
    return initialize(new Map([[message.id.asString, message]]));
  },
  fromArray(messages: Message[]): Messages {
    return initialize(
      new Map(messages.map((message) => [message.id.asString, message])),
    );
  },
  fromMap(messages: Map<MessageId, Message>): Messages {
    return initialize(
      new Map(Array.from(messages.entries()).map(([k, v]) => [k.asString, v])),
    );
  },
};

function convertJSONToMessages(jsonString: string): Messages {
  const obj = JSON.parse(jsonString);
  // console.log("convertJSONToMessages = ", obj);
  return Messages.fromArray(
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    obj.values.map((v: any) => convertJSONToMessage(JSON.stringify(v))),
  );
}

export { Messages, MessagesTypeSymbol, convertJSONToMessages };
