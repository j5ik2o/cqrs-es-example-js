import * as E from "fp-ts/lib/Either";
const GroupChatNameTypeSymbol = Symbol("GroupChatName");

interface GroupChatName {
  symbol: typeof GroupChatNameTypeSymbol;
  value: string;
  asString: string;
  equals: (anotherName: GroupChatName) => boolean;
}

function initialize(_value: string): GroupChatName {
  if (_value.length === 0) {
    throw new Error("Group chat name cannot be empty");
  }
  if (_value.length > 100) {
    throw new Error("Group chat name cannot be longer than 100 characters");
  }
  return {
    symbol: GroupChatNameTypeSymbol,
    get value() {
      return _value;
    },
    get asString() {
      return this.value;
    },
    equals(anotherName: GroupChatName): boolean {
      return this.value === anotherName.value;
    },
  };
}

const GroupChatName = {
  validate(value: string): E.Either<string, GroupChatName> {
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
  of(value: string): GroupChatName {
    return initialize(value);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToGroupChatName(json: any): GroupChatName {
  return GroupChatName.of(json.value);
}

export { GroupChatName, GroupChatNameTypeSymbol, convertJSONToGroupChatName };
