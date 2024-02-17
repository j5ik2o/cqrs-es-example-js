import { UserAccountId } from "../user-account";

class MemberId {
  constructor(public value: string) {}
  get asString(): string {
    return this.value;
  }
}

type MemberRole = "admin" | "member";

const MemberSymbol = Symbol("Member");

class Member {
  readonly symbol: typeof MemberSymbol = MemberSymbol;

  private constructor(
    public readonly userAccountId: UserAccountId,
    public readonly memberRole: MemberRole,
  ) {}
  static of(userAccountId: UserAccountId, memberRole: MemberRole): Member {
    return new Member(userAccountId, memberRole);
  }

  isAdministrator(): boolean {
    return this.memberRole === "admin";
  }

  isMember(): boolean {
    return this.memberRole === "member";
  }

  changeRole(memberRole: MemberRole): Member {
    return new Member(this.userAccountId, memberRole);
  }

  equals(other: Member): boolean {
    return this.userAccountId.value === other.userAccountId.value;
  }
}

export { MemberId, MemberRole, Member };
