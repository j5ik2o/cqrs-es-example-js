const GroupChatNameSymbol = Symbol("GroupChatName");

interface GroupChatName {
  symbol: typeof GroupChatNameSymbol;
  value: string;
  asString: string;
  equals: (anotherName: GroupChatName) => boolean;
}

function initialize(_value: string): GroupChatName {
  return {
    symbol: GroupChatNameSymbol,
    get value() {
      return _value;
    },
    get asString() {
      return _value;
    },
    equals(anotherName: GroupChatName): boolean {
      return _value === anotherName.value;
    },
  };
}

const GroupChatName = {
  of(value: string): GroupChatName {
    return initialize(value);
  },
};

export { GroupChatName };
