import { Member } from "./member";
import { UserAccountId } from "../user-account";
import * as O from "fp-ts/lib/Option";
const MembersSymbol = Symbol("Members");

class Members {
  readonly symbol: typeof MembersSymbol = MembersSymbol;

  private readonly _values: Map<string, Member>;

  private constructor(values: Map<string, Member>) {
    this._values = values;
  }

  static ofSingle(userAccountId: UserAccountId): Members {
    return new Members(
      new Map([[userAccountId.value, Member.of(userAccountId, "admin")]]),
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

  addMember(member: Member): Members {
    return new Members(
      new Map(this._values).set(member.userAccountId.value, member),
    );
  }

  removeMemberById(userAccountId: UserAccountId): O.Option<[Members, Member]> {
    const member = this._values.get(userAccountId.value);
    if (member === undefined) {
      return O.none;
    }
    const newMap = new Map(this._values);
    newMap.delete(userAccountId.value);
    return O.some([new Members(newMap), member]);
  }

  contains(userAccountId: UserAccountId): boolean {
    return this._values.has(userAccountId.value);
  }

  isMember(userAccountId: UserAccountId): boolean {
    const member = this._values.get(userAccountId.value);
    return member !== undefined && member.isMember();
  }

  isAdministrator(userAccountId: UserAccountId): boolean {
    const member = this._values.get(userAccountId.value);
    return member !== undefined && member.isAdministrator();
  }

  findById(userAccountId: UserAccountId): Member | undefined {
    return this._values.get(userAccountId.value);
  }

  toArray(): Member[] {
    return Array.from(this._values.values());
  }

  toMap(): Map<UserAccountId, Member> {
    return new Map(
      Array.from(this._values, ([key, value]) => [
        UserAccountId.of(key),
        value,
      ]),
    );
  }

  equals(other: Members): boolean {
    if (this._values.size !== other._values.size) {
      return false;
    }
    for (const [key, value] of this._values) {
      const otherValue = other._values.get(key);
      if (otherValue === undefined || !value.equals(otherValue)) {
        return false;
      }
    }
    return true;
  }
}

export { Members };
