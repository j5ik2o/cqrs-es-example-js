import { UserAccountId } from "../user-account";

class MemberId {
  constructor(public value: string) {}
  get asString(): string {
    return this.value;
  }
}

type MemberRole = "admin" | "member";

class Member {
  private constructor(
    public readonly userAccountId: UserAccountId,
    public readonly memberRole: MemberRole,
  ) {}
  static of(userAccountId: UserAccountId, memberRole: MemberRole): Member {
    return new Member(userAccountId, memberRole);
  }
}

export { MemberId, MemberRole, Member };
