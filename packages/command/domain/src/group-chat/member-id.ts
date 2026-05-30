import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import * as U from "ulidx";

const MEMBER_ID_BRAND: unique symbol = Symbol("MemberId");

export type MemberIdJson = {
  value: string;
};

export type MemberId = {
  value: string;
  asString: () => string;
  readonly [MEMBER_ID_BRAND]: true;
};

export namespace MemberId {
  export function of(value: string): MemberId {
    if (!U.isValid(value)) {
      throw new Error("Invalid member id");
    }
    return Object.freeze({
      [MEMBER_ID_BRAND]: true as const,
      value,
      asString: () => value,
    });
  }

  export function generate(): MemberId {
    return of(Infrastructure.generateULID());
  }

  export function equals(a: MemberId, b: MemberId): boolean {
    return a.value === b.value;
  }

  export function is(value: unknown): value is MemberId {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<MemberId>;
    return (
      candidate[MEMBER_ID_BRAND] === true && typeof candidate.value === "string"
    );
  }

  export function toJSON(value: MemberId): MemberIdJson {
    return { value: value.value };
  }

  export function fromJSON(json: unknown): MemberId {
    if (
      typeof json !== "object" ||
      json === null ||
      !("value" in json) ||
      typeof json.value !== "string"
    ) {
      throw new Error("Invalid MemberId JSON");
    }
    return of(json.value);
  }
}

export const convertJSONToMemberId = MemberId.fromJSON;
