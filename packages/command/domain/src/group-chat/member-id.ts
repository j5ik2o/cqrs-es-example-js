import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import * as U from "ulidx";

const MemberIdTypeSymbol = Symbol("MemberId");

class MemberId {
  readonly symbol: typeof MemberIdTypeSymbol = MemberIdTypeSymbol;
  private constructor(public readonly value: string) {
    if (!U.isValid(this.value)) {
      throw new Error("Invalid member id");
    }
  }

  toJSON() {
    return {
      value: this.value,
    };
  }

  asString() {
    return this.value;
  }

  toString() {
    return `MemberId(${this.value})`;
  }

  equals(anotherId: MemberId): boolean {
    return this.value === anotherId.value;
  }

  static of(value: string): MemberId {
    return new MemberId(value);
  }

  static generate(): MemberId {
    return new MemberId(Infrastructure.generateULID());
  }
}

// biome-ignore lint/suspicious/noExplicitAny:
function convertJSONToMemberId(json: any): MemberId {
  return MemberId.of(json.value);
}

export { MemberId, MemberIdTypeSymbol, convertJSONToMemberId };
