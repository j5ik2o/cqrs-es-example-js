import { convertJSONToUserAccountId, UserAccountId } from "../user-account";
import { convertJSONToMessageId, MessageId } from "./message-id";
import * as E from "fp-ts/lib/Either";

const MessageTypeSymbol = Symbol("Message");
interface MessageParams {
  id: MessageId;
  content: string;
  senderId: UserAccountId;
  sentAt: Date;
}
class Message {
  readonly symbol: typeof MessageTypeSymbol = MessageTypeSymbol;
  readonly id: MessageId;
  readonly content: string;
  readonly senderId: UserAccountId;
  readonly sentAt: Date;
  constructor(params: MessageParams) {
    this.id = params.id;
    this.content = params.content;
    this.senderId = params.senderId;
    this.sentAt = params.sentAt;
  }

  toJSON() {
    return {
      id: this.id.toJSON(),
      content: this.content,
      senderId: this.senderId.toJSON(),
      sentAt: this.sentAt.toISOString(),
    };
  }

  toString() {
    return `Message(${this.id.toString()}, ${this.content}, ${this.senderId.toString()}, ${this.sentAt.toISOString()})`;
  }
  equals(anotherMessage: Message): boolean {
    return (
      this.id.equals(anotherMessage.id) &&
      this.content === anotherMessage.content &&
      this.senderId.equals(anotherMessage.senderId) &&
      this.sentAt.getTime() === anotherMessage.sentAt.getTime()
    );
  }

  static validate(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): E.Either<string, Message> {
    try {
      return E.right(new Message({ id, content, senderId, sentAt }));
    } catch (e) {
      if (e instanceof Error) {
        return E.left(e.message);
      } else {
        throw e;
      }
    }
  }
  static of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    return new Message({ id, content, senderId, sentAt });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMessage(json: any): Message {
  const id = convertJSONToMessageId(json.id);
  const senderId = convertJSONToUserAccountId(json.senderId);
  return new Message({
    id,
    content: json.content,
    senderId,
    sentAt: new Date(json.sentAt),
  });
}

export { Message, MessageTypeSymbol, convertJSONToMessage };
