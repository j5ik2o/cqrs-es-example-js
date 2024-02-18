const GroupChatAddMemberErrorSymbol = Symbol("GroupChatAddMemberError");

interface GroupChatAddMemberError {
  symbol: typeof GroupChatAddMemberErrorSymbol;
  message: string;
}

const GroupChatAddMemberError = {
  of(message: string): GroupChatAddMemberError {
    return {
      symbol: GroupChatAddMemberErrorSymbol,
      message,
    };
  },
};

const GroupChatRemoveMemberErrorSymbol = Symbol("GroupChatMemberRemoveError");

interface GroupChatRemoveMemberError {
  symbol: typeof GroupChatRemoveMemberErrorSymbol;
  message: string;
}

const GroupChatRemoveMemberError = {
  of(message: string): GroupChatRemoveMemberError {
    return {
      symbol: GroupChatRemoveMemberErrorSymbol,
      message,
    };
  },
};

const GroupChatDeleteErrorSymbol = Symbol("GroupChatDeleteError");

interface GroupChatDeleteError {
  symbol: typeof GroupChatDeleteErrorSymbol;
  message: string;
}

const GroupChatDeleteError = {
  of(message: string): GroupChatDeleteError {
    return {
      symbol: GroupChatDeleteErrorSymbol,
      message,
    };
  },
};

const GroupChatPostErrorSymbol = Symbol("GroupChatPostError");

interface GroupChatPostMessageError {
  symbol: typeof GroupChatPostErrorSymbol;
  message: string;
}

const GroupChatPostMessageError = {
  of(message: string): GroupChatPostMessageError {
    return {
      symbol: GroupChatPostErrorSymbol,
      message,
    };
  },
};

const GroupChatDeleteMessageErrorSymbol = Symbol("GroupChatPostError");

interface GroupChatDeleteMessageError {
  symbol: typeof GroupChatDeleteMessageErrorSymbol;
  message: string;
}

const GroupChatDeleteMessageError = {
  of(message: string): GroupChatDeleteMessageError {
    return {
      symbol: GroupChatDeleteMessageErrorSymbol,
      message,
    };
  },
};

type GroupChatError =
  | GroupChatDeleteError
  | GroupChatAddMemberError
  | GroupChatRemoveMemberError
  | GroupChatPostMessageError
  | GroupChatDeleteMessageError;

export {
  GroupChatError,
  GroupChatAddMemberError,
  GroupChatRemoveMemberError,
  GroupChatPostMessageError,
  GroupChatDeleteMessageError,
  GroupChatDeleteError,
};
