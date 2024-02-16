import { ulid } from "ulidx";

const USER_ACCOUNT_PREFIX: string = "UserAccount";

class UserAccountId {
  private readonly _value: string;

  constructor(value?: string) {
    if (value === undefined) {
      this._value = ulid();
    } else {
      if (value.startsWith(USER_ACCOUNT_PREFIX + "-")) {
        value = value.substring(USER_ACCOUNT_PREFIX.length + 1);
      }
      this._value = value;
    }
  }

  asString(): string {
    return `${this.typeName}-${this._value}`;
  }

  get value(): string {
    return this._value;
  }

  get typeName(): string {
    return USER_ACCOUNT_PREFIX;
  }
}

export { UserAccountId };
