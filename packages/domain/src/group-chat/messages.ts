import { Message } from "./message";
import { MessageId } from "./message-id";
import * as O from "fp-ts/Option";

type Messages = Readonly<{
  addMessage: (message: Message) => Messages;
  removeMessageById: (messageId: MessageId) => O.Option<[Messages, Message]>;
  containsById: (messageId: MessageId) => boolean;
  findById: (messageId: MessageId) => Message | undefined;
  toArray: () => Message[];
  toMap: () => Map<MessageId, Message>;
}>;

function newMessages(values: Map<string, Message>): Messages {
  return {
    addMessage: (message: Message) =>
      newMessages(new Map(values).set(message.id.asString, message)),
    removeMessageById: (
      messageId: MessageId,
    ): O.Option<[Messages, Message]> => {
      const message = values.get(messageId.value);
      if (message === undefined) {
        return O.none;
      }
      const newMap = new Map(values);
      newMap.delete(messageId.value);
      return O.some([newMessages(newMap), message]);
    },
    containsById: (messageId: MessageId) => values.has(messageId.value),
    findById: (messageId: MessageId) => values.get(messageId.value),
    toArray: () =>
      Array.from(values.values()).sort((a, b) =>
        a.id.value.localeCompare(b.id.value),
      ),
    toMap: () =>
      new Map(
        Array.from(values.entries()).map(([k, v]) => [MessageId.of(k), v]),
      ),
  };
}

const Messages = {
  ofSingle(message: Message): Messages {
    return newMessages(new Map([[message.id.asString, message]]));
  },
  ofEmpty(): Messages {
    return newMessages(new Map());
  },
  fromArray(messages: Message[]): Messages {
    return newMessages(
      new Map(messages.map((message) => [message.id.asString, message])),
    );
  },
  fromMap(messages: Map<MessageId, Message>): Messages {
    return newMessages(
      new Map(Array.from(messages.entries()).map(([k, v]) => [k.asString, v])),
    );
  },
};

export { Messages };
