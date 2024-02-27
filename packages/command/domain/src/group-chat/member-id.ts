import * as U from "ulidx";

const MemberIdTypeSymbol = Symbol("MemberId");

class MemberId {
  readonly symbol: typeof MemberIdTypeSymbol = MemberIdTypeSymbol;
  private readonly _value: string;
  private constructor(value: string) {
    if (U.isValid(value) === false) {
      throw new Error("Invalid member id");
    }
    this._value = value;
  }
  get value() {
    return this._value;
  }
  asString() {
    return this._value;
  }

  toString() {
    return `MemberId(${this._value})`;
  }

  equals(anotherId: MemberId): boolean {
    return this._value === anotherId._value;
  }

  static of(value: string): MemberId {
    return new MemberId(value);
  }

  static generate(): MemberId {
    return new MemberId(U.ulid());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToMemberId(json: any): MemberId {
    return new MemberId(json.value);
  }
}

export { MemberId, MemberIdTypeSymbol };
