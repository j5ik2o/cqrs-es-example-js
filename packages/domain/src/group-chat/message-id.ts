import { ulid } from "ulidx";

const MessageIdSymbol = Symbol("MessageId");

type MessageId = Readonly<{
  symbol: typeof MessageIdSymbol;
  value: string;
  asString: string;
  equals: (anotherId: MessageId) => boolean;
}>;

function initialize(value: string): MessageId {
  return {
    symbol: MessageIdSymbol,
    value,
    get asString() {
      return value;
    },
    equals(anotherId: MessageId): boolean {
      return value === anotherId.value;
    },
  };
}

const MessageId = {
  of(value: string): MessageId {
    return initialize(value);
  },
  generate(): MessageId {
    return initialize(ulid());
  },
};

export { MessageId };
