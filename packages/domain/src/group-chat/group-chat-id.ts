import { ulid } from "ulidx";

const GROUP_CHAT_PREFIX: string = "GroupChat";
const GroupChatIdSymbol = Symbol("GroupChatId");

type GroupChatId = Readonly<{
  symbol: typeof GroupChatIdSymbol;
  value: string;
  typeName: string;
  asString: string;
  equals: (anotherId: GroupChatId) => boolean;
}>;

function initialize(value?: string): GroupChatId {
  const _value: string = initializeValue(value);

  function initializeValue(value?: string): string {
    if (value === undefined) {
      return ulid();
    } else {
      return value.startsWith(GROUP_CHAT_PREFIX + "-")
        ? value.substring(GROUP_CHAT_PREFIX.length + 1)
        : value;
    }
  }

  return {
    symbol: GroupChatIdSymbol,
    get value() {
      return _value;
    },
    get typeName() {
      return GROUP_CHAT_PREFIX;
    },
    get asString() {
      return `${GROUP_CHAT_PREFIX}-${_value}`;
    },
    equals(anotherId: GroupChatId): boolean {
      return _value === anotherId.value;
    },
  };
}

const GroupChatId = {
  of(value: string): GroupChatId {
    return initialize(value);
  },
  generate(): GroupChatId {
    return initialize();
  },
};

export { GroupChatId, GroupChatIdSymbol };
