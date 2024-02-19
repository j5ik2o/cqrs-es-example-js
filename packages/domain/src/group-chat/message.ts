import { convertJSONToUserAccountId, UserAccountId } from "../user-account";
import { convertJSONToMessageId, MessageId } from "./message-id";

const MessageTypeSymbol = Symbol("Message");

interface Message {
  symbol: typeof MessageTypeSymbol;
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
    symbol: MessageTypeSymbol,
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

function convertJSONToMessage(jsonString: string): Message {
  const obj = JSON.parse(jsonString);
  // console.log("convertJSONToMessage = ", obj);
  const id = convertJSONToMessageId(JSON.stringify(obj.id));
  const senderId = convertJSONToUserAccountId(JSON.stringify(obj.senderId));
  return initialize(id, obj.content, senderId, new Date(obj.sentAt));
}

export { Message, MessageTypeSymbol, convertJSONToMessage };
