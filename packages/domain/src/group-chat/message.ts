import { UserAccountId } from "../user-account";
import { MessageId } from "./message-id";

const MessageSymbol = Symbol("Message");

class Message {
  readonly symbol: typeof MessageSymbol = MessageSymbol;
  private constructor(
    public readonly id: MessageId,
    public readonly content: string,
    public readonly senderId: UserAccountId,
    public readonly sentAt: Date,
  ) {
    if (content.length > 1024) {
      throw new Error("Message content must be less than 1024 characters");
    }
  }

  static of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    return new Message(id, content, senderId, sentAt);
  }
}

export { Message };
