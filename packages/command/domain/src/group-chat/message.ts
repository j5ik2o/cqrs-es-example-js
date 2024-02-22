import { convertJSONToUserAccountId, UserAccountId } from "../user-account";
import { convertJSONToMessageId, MessageId } from "./message-id";
import * as E from "fp-ts/lib/Either";

const MessageTypeSymbol = Symbol("Message");

interface Message {
  symbol: typeof MessageTypeSymbol;
  id: MessageId;
  content: string;
  senderId: UserAccountId;
  sentAt: Date;
  toString: () => string;
  equals: (anotherMessage: Message) => boolean;
}

function initialize(
  id: MessageId,
  content: string,
  senderId: UserAccountId,
  sentAt: Date,
): Message {
  if (content.length === 0) {
    throw new Error("Message content cannot be empty");
  }
  if (content.length > 1000) {
    throw new Error("Message content cannot be longer than 1000 characters");
  }
  return {
    symbol: MessageTypeSymbol,
    id,
    content,
    senderId,
    sentAt,
    toString() {
      return `Message(${this.id.toString()}, ${this.content}, ${this.senderId.toString()}, ${this.sentAt.toISOString()})`;
    },
    equals(anotherMessage: Message): boolean {
      return (
        id.equals(anotherMessage.id) &&
        content === anotherMessage.content &&
        senderId.equals(anotherMessage.senderId) &&
        sentAt.getTime() === anotherMessage.sentAt.getTime()
      );
    },
  };
}

const Message = {
  validate(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): E.Either<string, Message> {
    try {
      return E.right(initialize(id, content, senderId, sentAt));
    } catch (e) {
      if (e instanceof Error) {
        return E.left(e.message);
      } else {
        throw e;
      }
    }
  },
  of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    return initialize(id, content, senderId, sentAt);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMessage(json: any): Message {
  // console.log("convertJSONToMessage = ", obj);
  const id = convertJSONToMessageId(json.id);
  const senderId = convertJSONToUserAccountId(json.senderId);
  return initialize(id, json.content, senderId, new Date(json.sentAt));
}

export { Message, MessageTypeSymbol, convertJSONToMessage };
