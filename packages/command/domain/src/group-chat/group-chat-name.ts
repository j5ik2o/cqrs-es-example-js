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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToGroupChatName(json: any): GroupChatName {
  return GroupChatName.of(json.value);
}

export { GroupChatName, GroupChatNameTypeSymbol, convertJSONToGroupChatName };
