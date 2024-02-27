import * as U from "ulidx";
import * as E from "fp-ts/Either";
import { AggregateId } from "event-store-adapter-js";

const USER_ACCOUNT_PREFIX: string = "UserAccount";
const UserAccountIdTypeSymbol = Symbol("UserAccountId");

class UserAccountId implements AggregateId {
  readonly symbol: typeof UserAccountIdTypeSymbol = UserAccountIdTypeSymbol;
  readonly typeName: string = USER_ACCOUNT_PREFIX;
  private constructor(public readonly value: string) {}

  toJSON() {
    return {
      value: this.value,
    };
  }

  asString() {
    return `${USER_ACCOUNT_PREFIX}-${this.value}`;
  }
  toString() {
    return `UserAccountId(${this.value})`;
  }

  equals(anotherId: UserAccountId): boolean {
    return this.value === anotherId.value;
  }

  static validate(value: string): E.Either<string, UserAccountId> {
    try {
      return E.right(new UserAccountId(value));
    } catch (error) {
      if (error instanceof Error) {
        return E.left(error.message);
      } else {
        throw error;
      }
    }
  }
  static of(value: string): UserAccountId {
    const ulid = value.startsWith(USER_ACCOUNT_PREFIX + "-")
      ? value.substring(USER_ACCOUNT_PREFIX.length + 1)
      : value;
    if (U.isValid(ulid)) {
      return new UserAccountId(ulid);
    } else {
      throw new Error("Invalid user account id");
    }
  }
  static generate(): UserAccountId {
    return new UserAccountId(U.ulid());
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToUserAccountId(json: any): UserAccountId {
  return UserAccountId.of(json.value);
}

export { UserAccountId, UserAccountIdTypeSymbol, convertJSONToUserAccountId };
