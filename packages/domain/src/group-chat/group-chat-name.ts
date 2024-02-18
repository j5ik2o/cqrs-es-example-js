const GroupChatNameSymbol = Symbol("GroupChatName");

type GroupChatName = Readonly<{
  symbol: typeof GroupChatNameSymbol;
  value: string;
  asString: string;
  equals: (anotherName: GroupChatName) => boolean;
}>;

function newGroupChatName(value: string): GroupChatName {
  const _value: string = value;

  const equals = (anotherName: GroupChatName): boolean =>
    _value === anotherName.value;

  return {
    symbol: GroupChatNameSymbol,
    get value() {
      return _value;
    },
    get asString() {
      return _value;
    },
    equals,
  };
}

const GroupChatName = {
  of(value: string): GroupChatName {
    return newGroupChatName(value);
  },
};

export { GroupChatName };
