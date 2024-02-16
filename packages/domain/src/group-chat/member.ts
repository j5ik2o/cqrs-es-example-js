import { UserAccountId } from "../user-account";

class MemberId {
  constructor(public value: string) {}
  get asString(): string {
    return this.value;
  }
}

type MemberRole = "admin" | "member";

class Member {
  constructor(
    public readonly userAccountId: UserAccountId,
    public readonly memberRole: MemberRole,
  ) {}
}

export { MemberId, MemberRole, Member };
