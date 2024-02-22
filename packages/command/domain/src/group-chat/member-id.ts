import * as U from "ulidx";

const MemberIdTypeSymbol = Symbol("MemberId");

interface MemberId {
  symbol: typeof MemberIdTypeSymbol;
  value: string;
  asString: () => string;
  toString: () => string;
  equals: (anotherId: MemberId) => boolean;
}

function initialize(value: string): MemberId {
  return {
    symbol: MemberIdTypeSymbol,
    value,
    asString() {
      return value;
    },
    toString() {
      return `MemberId(${value})`;
    },
    equals(anotherId: MemberId): boolean {
      return value === anotherId.value;
    },
  };
}

const MemberId = {
  of(value: string): MemberId {
    return initialize(value);
  },
  generate(): MemberId {
    return initialize(U.ulid());
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMemberId(json: any): MemberId {
  return initialize(json.value);
}

export { MemberId, MemberIdTypeSymbol, convertJSONToMemberId };
