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

function convertJSONToGroupChatName(jsonString: string): GroupChatName {
  const obj = JSON.parse(jsonString);
  return GroupChatName.of(obj.value);
}

export { GroupChatName, GroupChatNameTypeSymbol, convertJSONToGroupChatName };
