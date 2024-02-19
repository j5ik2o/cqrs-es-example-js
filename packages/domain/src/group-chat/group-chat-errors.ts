const GroupChatAddMemberErrorTypeSymbol = Symbol("GroupChatAddMemberError");

interface GroupChatAddMemberError {
  symbol: typeof GroupChatAddMemberErrorTypeSymbol;
  message: string;
}

const GroupChatAddMemberError = {
  of(message: string): GroupChatAddMemberError {
    return {
      symbol: GroupChatAddMemberErrorTypeSymbol,
      message,
    };
  },
};

const GroupChatRemoveMemberErrorTypeSymbol = Symbol(
  "GroupChatMemberRemoveError",
);

interface GroupChatRemoveMemberError {
  symbol: typeof GroupChatRemoveMemberErrorTypeSymbol;
  message: string;
}

const GroupChatRemoveMemberError = {
  of(message: string): GroupChatRemoveMemberError {
    return {
      symbol: GroupChatRemoveMemberErrorTypeSymbol,
      message,
    };
  },
};

const GroupChatPostMessageErrorTypeSymbol = Symbol("GroupChatPostError");

interface GroupChatPostMessageError {
  symbol: typeof GroupChatPostMessageErrorTypeSymbol;
  message: string;
}

const GroupChatPostMessageError = {
  of(message: string): GroupChatPostMessageError {
    return {
      symbol: GroupChatPostMessageErrorTypeSymbol,
      message,
    };
  },
};

const GroupChatDeleteMessageErrorTypeSymbol = Symbol("GroupChatPostError");

interface GroupChatDeleteMessageError {
  symbol: typeof GroupChatDeleteMessageErrorTypeSymbol;
  message: string;
}

const GroupChatDeleteMessageError = {
  of(message: string): GroupChatDeleteMessageError {
    return {
      symbol: GroupChatDeleteMessageErrorTypeSymbol,
      message,
    };
  },
};

const GroupChatDeleteErrorTypeSymbol = Symbol("GroupChatDeleteError");

interface GroupChatDeleteError {
  symbol: typeof GroupChatDeleteErrorTypeSymbol;
  message: string;
}

const GroupChatDeleteError = {
  of(message: string): GroupChatDeleteError {
    return {
      symbol: GroupChatDeleteErrorTypeSymbol,
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
  GroupChatAddMemberErrorTypeSymbol,
  GroupChatRemoveMemberError,
  GroupChatRemoveMemberErrorTypeSymbol,
  GroupChatPostMessageError,
  GroupChatPostMessageErrorTypeSymbol,
  GroupChatDeleteMessageError,
  GroupChatDeleteMessageErrorTypeSymbol,
  GroupChatDeleteError,
  GroupChatDeleteErrorTypeSymbol,
};
