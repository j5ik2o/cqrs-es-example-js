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

function convertJSONToMessageId(jsonString: string): MessageId {
  const obj = JSON.parse(jsonString);
  // console.log("convertJSONToMessageId = ", obj);
  return initialize(obj.value);
}

export { MessageId, MessageIdTypeSymbol, convertJSONToMessageId };
