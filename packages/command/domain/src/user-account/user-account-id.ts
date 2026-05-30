import { type AggregateId, Result } from "event-store-adapter-js";
import * as U from "ulidx";

const USER_ACCOUNT_PREFIX = "UserAccount";
const USER_ACCOUNT_ID_BRAND: unique symbol = Symbol("UserAccountId");

export type UserAccountIdJson = {
  value: string;
};

export type UserAccountId = AggregateId & {
  typeName: typeof USER_ACCOUNT_PREFIX;
  readonly [USER_ACCOUNT_ID_BRAND]: true;
};

export namespace UserAccountId {
  export function of(value: string): UserAccountId {
    const ulid = value.startsWith(`${USER_ACCOUNT_PREFIX}-`)
      ? value.substring(USER_ACCOUNT_PREFIX.length + 1)
      : value;
    if (!U.isValid(ulid)) {
      throw new Error(`Invalid user account id: ${value}`);
    }
    return Object.freeze({
      [USER_ACCOUNT_ID_BRAND]: true as const,
      typeName: USER_ACCOUNT_PREFIX,
      value: ulid,
      asString: () => `${USER_ACCOUNT_PREFIX}-${ulid}`,
    });
  }

  export function generate(): UserAccountId {
    return of(U.ulid());
  }

  export function validate(value: string): Result<UserAccountId, string> {
    try {
      return Result.ok(of(value));
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  }

  export function equals(a: UserAccountId, b: UserAccountId): boolean {
    return a.value === b.value;
  }

  export function is(value: unknown): value is UserAccountId {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<UserAccountId>;
    return (
      candidate[USER_ACCOUNT_ID_BRAND] === true &&
      candidate.typeName === USER_ACCOUNT_PREFIX &&
      typeof candidate.value === "string" &&
      typeof candidate.asString === "function"
    );
  }

  export function toJSON(value: UserAccountId): UserAccountIdJson {
    return { value: value.value };
  }

  export function fromJSON(json: unknown): UserAccountId {
    if (
      typeof json !== "object" ||
      json === null ||
      !("value" in json) ||
      typeof json.value !== "string"
    ) {
      throw new Error("Invalid UserAccountId JSON");
    }
    return of(json.value);
  }
}

export const convertJSONToUserAccountId = UserAccountId.fromJSON;
