const GroupChatNameTypeSymbol = Symbol("GroupChatName");

interface GroupChatName {
  symbol: typeof GroupChatNameTypeSymbol;
  value: string;
  asString: string;
  equals: (anotherName: GroupChatName) => boolean;
}

function initialize(_value: string): GroupChatName {
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
  of(value: string): GroupChatName {
    return initialize(value);
  },
};

export { GroupChatName, GroupChatNameTypeSymbol };
