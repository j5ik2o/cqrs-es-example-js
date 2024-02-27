abstract class GroupChatError extends Error {}

const GroupChatRenameErrorTypeSymbol = Symbol("GroupChatRenameError");

class GroupChatRenameError extends GroupChatError {
  symbol: typeof GroupChatRenameErrorTypeSymbol =
    GroupChatRenameErrorTypeSymbol;
  private constructor(message: string, cause?: Error) {
    super(message, cause);
  }
  static of(message: string, cause?: Error): GroupChatRenameError {
    return new GroupChatRenameError(message, cause);
  }
}

const GroupChatAddMemberErrorTypeSymbol = Symbol("GroupChatAddMemberError");

class GroupChatAddMemberError extends GroupChatError {
  symbol: typeof GroupChatAddMemberErrorTypeSymbol =
    GroupChatAddMemberErrorTypeSymbol;
  private constructor(message: string, error?: Error) {
    super(message, error);
  }
  static of(message: string, error?: Error): GroupChatAddMemberError {
    return new GroupChatAddMemberError(message, error);
  }
}

const GroupChatRemoveMemberErrorTypeSymbol = Symbol(
  "GroupChatMemberRemoveError",
);

class GroupChatRemoveMemberError extends GroupChatError {
  symbol: typeof GroupChatRemoveMemberErrorTypeSymbol =
    GroupChatRemoveMemberErrorTypeSymbol;
  private constructor(message: string, error?: Error) {
    super(message, error);
  }
  static of(message: string, error?: Error): GroupChatRemoveMemberError {
    return new GroupChatRemoveMemberError(message, error);
  }
}

const GroupChatPostMessageErrorTypeSymbol = Symbol("GroupChatPostError");

class GroupChatPostMessageError extends GroupChatError {
  symbol: typeof GroupChatPostMessageErrorTypeSymbol =
    GroupChatPostMessageErrorTypeSymbol;
  private constructor(message: string, error?: Error) {
    super(message, error);
  }
  static of(message: string, error?: Error): GroupChatPostMessageError {
    return new GroupChatPostMessageError(message, error);
  }
}

const GroupChatDeleteMessageErrorTypeSymbol = Symbol("GroupChatPostError");

class GroupChatDeleteMessageError extends GroupChatError {
  symbol: typeof GroupChatDeleteMessageErrorTypeSymbol =
    GroupChatDeleteMessageErrorTypeSymbol;
  private constructor(message: string, error?: Error) {
    super(message, error);
  }
  static of(message: string, error?: Error): GroupChatDeleteMessageError {
    return new GroupChatDeleteMessageError(message, error);
  }
}

const GroupChatDeleteErrorTypeSymbol = Symbol("GroupChatDeleteError");

class GroupChatDeleteError extends Error {
  readonly symbol: typeof GroupChatDeleteErrorTypeSymbol =
    GroupChatDeleteErrorTypeSymbol;
  private constructor(message: string, cause?: Error) {
    super(message);
    this.name = "GroupChatDeleteError";
    this.cause = cause;
  }
  static of(message: string): GroupChatDeleteError {
    return new GroupChatDeleteError(message);
  }
}

export {
  GroupChatError,
  GroupChatRenameError,
  GroupChatRenameErrorTypeSymbol,
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
