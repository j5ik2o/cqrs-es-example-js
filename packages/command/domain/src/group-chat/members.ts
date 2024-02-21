import { convertJSONToMember, Member } from "./member";
import { UserAccountId } from "../user-account";
import * as O from "fp-ts/lib/Option";
import { MemberId } from "./member-id";

const MembersTypeSymbol = Symbol("Members");

interface Members {
  symbol: typeof MembersTypeSymbol;
  values: Member[];
  addMember: (member: Member) => Members;
  removeMemberById: (
    userAccountId: UserAccountId,
  ) => O.Option<[Members, Member]>;
  containsById: (userAccountId: UserAccountId) => boolean;
  isMember: (userAccountId: UserAccountId) => boolean;
  isAdministrator: (userAccountId: UserAccountId) => boolean;
  findById: (userAccountId: UserAccountId) => Member | undefined;
  toArray: () => Member[];
  toMap: () => Map<UserAccountId, Member>;
  equals: (other: Members) => boolean;
}

function initialize(_values: Map<string, Member>): Members {
  return {
    symbol: MembersTypeSymbol,
    get values() {
      return this.toArray();
    },
    addMember(member: Member): Members {
      return initialize(
        new Map(_values).set(member.userAccountId.value, member),
      );
    },
    removeMemberById(
      userAccountId: UserAccountId,
    ): O.Option<[Members, Member]> {
      const member = _values.get(userAccountId.value);
      if (member === undefined) {
        return O.none;
      }
      const newMap = new Map(_values);
      newMap.delete(userAccountId.value);
      return O.some([initialize(newMap), member]);
    },
    containsById(userAccountId: UserAccountId): boolean {
      return _values.has(userAccountId.value);
    },
    isMember(userAccountId: UserAccountId): boolean {
      const member = _values.get(userAccountId.value);
      return member !== undefined && member.isMember();
    },
    isAdministrator(userAccountId: UserAccountId): boolean {
      const member = _values.get(userAccountId.value);
      return member !== undefined && member.isAdministrator();
    },
    findById(userAccountId: UserAccountId): Member | undefined {
      return _values.get(userAccountId.value);
    },
    toArray(): Member[] {
      return Array.from(_values.values());
    },
    toMap(): Map<UserAccountId, Member> {
      return new Map(
        Array.from(_values, ([key, value]) => [UserAccountId.of(key), value]),
      );
    },
    equals(other: Members): boolean {
      const values = this.toMap();
      if (values.size !== other.toMap().size) {
        return false;
      }
      for (const [key, value] of values) {
        const otherValue = _values.get(key.value);
        if (otherValue === undefined || !value.equals(otherValue)) {
          return false;
        }
      }
      return true;
    },
  };
}

const Members = {
  ofSingle(userAccountId: UserAccountId): Members {
    return initialize(
      new Map([
        [
          userAccountId.value,
          Member.of(MemberId.generate(), userAccountId, "administrator"),
        ],
      ]),
    );
  },
  fromMap(values: Map<UserAccountId, Member>): Members {
    return initialize(
      new Map(
        Array.from(values, ([userAccountId, member]) => [
          userAccountId.value,
          member,
        ]),
      ),
    );
  },
  fromArray(values: Member[]): Members {
    return initialize(new Map(values.map((m) => [m.userAccountId.value, m])));
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMembers(json: any): Members {
  // console.log("convertJSONToMembers = ", obj);
  return Members.fromArray(
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    json.values.map((v: any) => convertJSONToMember(v)),
  );
}

export { Members, MembersTypeSymbol, convertJSONToMembers };
