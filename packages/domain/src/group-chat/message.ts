import { UserAccountId } from "../user-account";
import { MessageId } from "./message-id";

const MessageSymbol = Symbol("Message");

type Message = Readonly<{
  symbol: typeof MessageSymbol;
  id: MessageId;
  content: string;
  senderId: UserAccountId;
  sentAt: Date;
}>;

function newMessage(
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
  };
}

const Message = {
  of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    return newMessage(id, content, senderId, sentAt);
  },
};

export { Message };
