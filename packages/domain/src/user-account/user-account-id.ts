import { ulid } from "ulidx";

const USER_ACCOUNT_PREFIX: string = "UserAccount";
const UserAccountIdTypeSymbol = Symbol("UserAccountId");

interface UserAccountId {
  symbol: typeof UserAccountIdTypeSymbol;
  value: string;
  typeName: string;
  asString: string;
  equals: (anotherId: UserAccountId) => boolean;
}

function initialize(value?: string): UserAccountId {
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
    symbol: UserAccountIdTypeSymbol,
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
    return initialize(value);
  },
  generate(): UserAccountId {
    return initialize();
  },
};

function convertJSONToUserAccountId(jsonString: string): UserAccountId {
  const obj = JSON.parse(jsonString);
  return UserAccountId.of(obj.value);
}

export { UserAccountId, UserAccountIdTypeSymbol, convertJSONToUserAccountId };
