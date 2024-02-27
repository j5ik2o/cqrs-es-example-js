import * as U from "ulidx";
import * as E from "fp-ts/Either";
import { AggregateId } from "event-store-adapter-js";

const USER_ACCOUNT_PREFIX: string = "UserAccount";
const UserAccountIdTypeSymbol = Symbol("UserAccountId");

class UserAccountId implements AggregateId {
  readonly symbol: typeof UserAccountIdTypeSymbol = UserAccountIdTypeSymbol;
  typeName: string = USER_ACCOUNT_PREFIX;
  private readonly _value: string;
  private constructor(value?: string) {
    if (value === undefined) {
      this._value = U.ulid();
    } else {
      const ulid = value.startsWith(USER_ACCOUNT_PREFIX + "-")
        ? value.substring(USER_ACCOUNT_PREFIX.length + 1)
        : value;
      if (U.isValid(ulid)) {
        this._value = ulid;
      } else {
        throw new Error("Invalid user account id");
      }
    }
  }
  get value() {
    return this._value;
  }
  asString() {
    return `${USER_ACCOUNT_PREFIX}-${this._value}`;
  }
  toString() {
    return `UserAccountId(${this._value})`;
  }

  equals(anotherId: UserAccountId): boolean {
    return this._value === anotherId.value;
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
    return new UserAccountId(value);
  }
  static generate(): UserAccountId {
    return new UserAccountId();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToUserAccountId(json: any): UserAccountId {
    return UserAccountId.of(json.value);
  }
}

export { UserAccountId, UserAccountIdTypeSymbol };
