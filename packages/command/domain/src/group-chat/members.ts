import { convertJSONToMember, Member } from "./member";
import { UserAccountId } from "../user-account";
import * as O from "fp-ts/lib/Option";
import { MemberId } from "./member-id";

const MembersTypeSymbol = Symbol("Members");

class Members {
  readonly symbol: typeof MembersTypeSymbol = MembersTypeSymbol;

  private constructor(public readonly values: Map<string, Member>) {
    if (values.size === 0) {
      throw new Error("Members cannot be empty");
    }
  }

  toJSON() {
    return {
      values: this.toArray().map((m) => m.toJSON()),
    };
  }

  addMember(member: Member): Members {
    return new Members(
      new Map(this.values).set(member.userAccountId.value, member),
    );
  }

  removeMemberById(userAccountId: UserAccountId): O.Option<[Members, Member]> {
    const member = this.values.get(userAccountId.value);
    if (member === undefined) {
      return O.none;
    }
    const newMap = new Map(this.values);
    newMap.delete(userAccountId.value);
    return O.some([new Members(newMap), member]);
  }

  containsById(userAccountId: UserAccountId): boolean {
    return this.values.has(userAccountId.value);
  }

  isMember(userAccountId: UserAccountId): boolean {
    const member = this.values.get(userAccountId.value);
    return member !== undefined && member.isMember();
  }

  isAdministrator(userAccountId: UserAccountId): boolean {
    const member = this.values.get(userAccountId.value);
    return member !== undefined && member.isAdministrator();
  }

  findById(userAccountId: UserAccountId): Member | undefined {
    return this.values.get(userAccountId.value);
  }

  toArray(): Member[] {
    return Array.from(this.values.values());
  }

  toMap(): Map<UserAccountId, Member> {
    return new Map(
      Array.from(this.values, ([key, value]) => [UserAccountId.of(key), value]),
    );
  }

  toString() {
    return `Members(${JSON.stringify(this.toArray().map((m) => m.toString()))})`;
  }

  equals(other: Members): boolean {
    const values = this.toMap();
    if (values.size !== other.toMap().size) {
      return false;
    }
    for (const [key, value] of values) {
      const otherValue = this.values.get(key.value);
      if (otherValue === undefined || !value.equals(otherValue)) {
        return false;
      }
    }
    return true;
  }

  static ofSingle(userAccountId: UserAccountId): Members {
    return new Members(
      new Map([
        [
          userAccountId.value,
          Member.of(MemberId.generate(), userAccountId, "administrator"),
        ],
      ]),
    );
  }

  static fromMap(values: Map<UserAccountId, Member>): Members {
    return new Members(
      new Map(
        Array.from(values, ([userAccountId, member]) => [
          userAccountId.value,
          member,
        ]),
      ),
    );
  }

  static fromArray(values: Member[]): Members {
    return new Members(new Map(values.map((m) => [m.userAccountId.value, m])));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMembers(json: any): Members {
  // console.log("convertJSONToMembers = ", obj);
  return Members.fromArray(
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    json.values.map((v: any) => convertJSONToMember(v)),
  );
}

export { Members, MembersTypeSymbol, convertJSONToMembers };
