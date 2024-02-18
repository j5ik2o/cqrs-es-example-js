import { UserAccountId } from "../user-account";
import { MessageId } from "./message-id";

const MessageSymbol = Symbol("Message");

interface Message {
  symbol: typeof MessageSymbol;
  id: MessageId;
  content: string;
  senderId: UserAccountId;
  sentAt: Date;
  equals: (anotherMessage: Message) => boolean;
}

function initialize(
  id: MessageId,
  content: string,
  senderId: UserAccountId,
  sentAt: Date,
): Message {
  return {
    symbol: MessageSymbol,
    id,
    content,
    senderId,
    sentAt,
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
  of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    return initialize(id, content, senderId, sentAt);
  },
};

export { Message };
