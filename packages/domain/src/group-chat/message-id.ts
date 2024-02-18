import { ulid } from "ulidx";

const MessageIdSymbol = Symbol("MessageId");

type MessageId = Readonly<{
  symbol: typeof MessageIdSymbol;
  value: string;
  asString: string;
}>;

function newMessageId(value: string): MessageId {
  return {
    symbol: MessageIdSymbol,
    value,
    get asString() {
      return value;
    },
  };
}

const MessageId = {
  of(value: string): MessageId {
    return newMessageId(value);
  },
  generate(): MessageId {
    return newMessageId(ulid());
  },
};

export { MessageId };
