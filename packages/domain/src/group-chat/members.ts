import { Member } from "./member";
import { UserAccountId } from "../user-account";

class Members {
  private readonly _values: Map<string, Member>;
  private constructor(values: Map<string, Member>) {
    this._values = values;
  }

  static fromMap(values: Map<UserAccountId, Member>): Members {
    return new Members(
      new Map<string, Member>(
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

  removeMember(userAccountId: UserAccountId): Members {
    const map = new Map(this._values);
    map.delete(userAccountId.value);
    return new Members(map);
  }

  isMember(userAccountId: UserAccountId): boolean {
    const member = this._values.get(userAccountId.value);
    return member !== undefined && member.memberRole === "member";
  }

  isAdministrator(userAccountId: UserAccountId): boolean {
    const member = this._values.get(userAccountId.value);
    return member !== undefined && member.memberRole === "admin";
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
}

export { Members };
