const GroupChatAddMemberErrorSymbol = Symbol("GroupChatAddMemberError");

type GroupChatAddMemberError = Readonly<{
  symbol: typeof GroupChatAddMemberErrorSymbol;
  message: string;
}>;

const GroupChatAddMemberError = {
  of(message: string): GroupChatAddMemberError {
    return {
      symbol: GroupChatAddMemberErrorSymbol,
      message,
    };
  },
};

const GroupChatRemoveMemberErrorSymbol = Symbol("GroupChatMemberRemoveError");

type GroupChatRemoveMemberError = Readonly<{
  symbol: typeof GroupChatRemoveMemberErrorSymbol;
  message: string;
}>;

const GroupChatRemoveMemberError = {
  of(message: string): GroupChatRemoveMemberError {
    return {
      symbol: GroupChatRemoveMemberErrorSymbol,
      message,
    };
  },
};

const GroupChatDeleteErrorSymbol = Symbol("GroupChatDeleteError");

type GroupChatDeleteError = Readonly<{
  symbol: typeof GroupChatDeleteErrorSymbol;
  message: string;
}>;

const GroupChatDeleteError = {
  of(message: string): GroupChatDeleteError {
    return {
      symbol: GroupChatDeleteErrorSymbol,
      message,
    };
  },
};

const GroupChatPostErrorSymbol = Symbol("GroupChatPostError");

type GroupChatPostError = Readonly<{
  symbol: typeof GroupChatPostErrorSymbol;
  message: string;
}>;

const GroupChatPostError = {
  of(message: string): GroupChatPostError {
    return {
      symbol: GroupChatPostErrorSymbol,
      message,
    };
  },
};

type GroupChatError =
  | GroupChatDeleteError
  | GroupChatAddMemberError
  | GroupChatRemoveMemberError
  | GroupChatPostError;

export {
  GroupChatError,
  GroupChatAddMemberError,
  GroupChatRemoveMemberError,
  GroupChatPostError,
  GroupChatDeleteError,
};
