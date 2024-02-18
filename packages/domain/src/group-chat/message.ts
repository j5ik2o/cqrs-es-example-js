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
