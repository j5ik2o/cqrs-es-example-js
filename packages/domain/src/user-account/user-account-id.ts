import { ulid } from "ulidx";

const USER_ACCOUNT_PREFIX: string = "UserAccount";
const UserAccountIdSymbol = Symbol("UserAccountId");

type UserAccountId = Readonly<{
  symbol: typeof UserAccountIdSymbol;
  value: string;
  typeName: string;
  asString: string;
  equals: (anotherId: UserAccountId) => boolean;
}>;

function newUserAccountId(value?: string): UserAccountId {
  const _value: string = initializeValue(value);

  function initializeValue(value?: string): string {
    if (value === undefined) {
      return ulid();
    } else {
      return value.startsWith(USER_ACCOUNT_PREFIX + "-")
        ? value.substring(USER_ACCOUNT_PREFIX.length + 1)
        : value;
    }
  }

  const equals = (anotherId: UserAccountId): boolean =>
    _value === anotherId.value;

  return {
    symbol: UserAccountIdSymbol,
    get value() {
      return _value;
    },
    get typeName() {
      return USER_ACCOUNT_PREFIX;
    },
    get asString() {
      return `${USER_ACCOUNT_PREFIX}-${_value}`;
    },
    equals,
  };
}

const UserAccountId = {
  of(value: string): UserAccountId {
    return newUserAccountId(value);
  },
  generate(): UserAccountId {
    return newUserAccountId();
  },
};

export { UserAccountId };
