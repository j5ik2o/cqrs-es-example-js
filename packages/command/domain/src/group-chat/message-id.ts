import * as U from "ulidx";
import * as E from "fp-ts/lib/Either";
const MessageIdTypeSymbol = Symbol("MessageId");

interface MessageId {
  symbol: typeof MessageIdTypeSymbol;
  value: string;
  asString: () => string;
  equals: (anotherId: MessageId) => boolean;
}

function initialize(value: string): MessageId {
  if (!U.isValid(value)) {
    throw new Error("Invalid message id");
  }
  return {
    symbol: MessageIdTypeSymbol,
    value,
    asString() {
      return value;
    },
    equals(anotherId: MessageId): boolean {
      return value === anotherId.value;
    },
  };
}

const MessageId = {
  validate(value: string): E.Either<string, MessageId> {
    try {
      return E.right(initialize(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  },
  of(value: string): MessageId {
    return initialize(value);
  },
  generate(): MessageId {
    return initialize(U.ulid());
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMessageId(json: any): MessageId {
  return initialize(json.value);
}

export { MessageId, MessageIdTypeSymbol, convertJSONToMessageId };
