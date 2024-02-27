import { UserAccountId } from "../user-account";
import { MemberId } from "./member-id";

type MemberRole = "administrator" | "member";

const MemberTypeSymbol = Symbol("Member");

interface MemberParams {
  id: MemberId;
  userAccountId: UserAccountId;
  memberRole: MemberRole;
}

class Member {
  readonly symbol: typeof MemberTypeSymbol = MemberTypeSymbol;

  public readonly id: MemberId;
  public readonly userAccountId: UserAccountId;
  public readonly memberRole: MemberRole;

  private constructor(params: MemberParams) {
    this.id = params.id;
    this.userAccountId = params.userAccountId;
    this.memberRole = params.memberRole;
  }

  isAdministrator() {
    return this.memberRole === "administrator";
  }
  isMember() {
    return this.memberRole === "member";
  }
  withRole(role: MemberRole) {
    return new Member({ ...this, memberRole: role });
  }
  toString() {
    return `Member(${this.id.toString()}, ${this.userAccountId.toString()}, ${this.memberRole.toString()})`;
  }
  equals(other: Member) {
    return this.userAccountId.value === other.userAccountId.value;
  }

  static of(
    id: MemberId,
    userAccountId: UserAccountId,
    memberRole: MemberRole,
  ): Member {
    return new Member({ id, userAccountId, memberRole });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToMember(json: any): Member {
    const id = MemberId.convertJSONToMemberId(json.id);
    const userAccountId = UserAccountId.convertJSONToUserAccountId(json.userAccountId);
    return Member.of(id, userAccountId, json.memberRole);
  }
}

export { MemberRole, Member, MemberTypeSymbol };
