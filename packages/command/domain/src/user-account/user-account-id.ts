import * as U from "ulidx";
import * as E from "fp-ts/Either";

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
      return U.ulid();
    } else {
      const ulid = value.startsWith(USER_ACCOUNT_PREFIX + "-")
        ? value.substring(USER_ACCOUNT_PREFIX.length + 1)
        : value;
      if (U.isValid(ulid)) {
        return ulid;
      } else {
        throw new Error("Invalid user account id");
      }
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
  validate(value: string): E.Either<string, UserAccountId> {
    try {
      return E.right(initialize(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  },
  of(value: string): UserAccountId {
    return initialize(value);
  },
  generate(): UserAccountId {
    return initialize();
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToUserAccountId(json: any): UserAccountId {
  return UserAccountId.of(json.value);
}

export { UserAccountId, UserAccountIdTypeSymbol, convertJSONToUserAccountId };
