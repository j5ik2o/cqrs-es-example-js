import { ulid } from "ulidx";

const MessageIdTypeSymbol = Symbol("MessageId");

interface MessageId {
  symbol: typeof MessageIdTypeSymbol;
  value: string;
  asString: string;
  equals: (anotherId: MessageId) => boolean;
}

function initialize(value: string): MessageId {
  return {
    symbol: MessageIdTypeSymbol,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMessageId(json: any): MessageId {
  return initialize(json.value);
}

export { MessageId, MessageIdTypeSymbol, convertJSONToMessageId };
