import type {
  UserAccountId,
  convertJSONToUserAccountId,
} from "../user-account";
import type { MemberId, convertJSONToMemberId } from "./member-id";

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

  toJSON() {
    return {
      id: this.id.toJSON(),
      userAccountId: this.userAccountId.toJSON(),
      memberRole: this.memberRole,
    };
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
}

// biome-ignore lint/suspicious/noExplicitAny:
function convertJSONToMember(json: any): Member {
  const id = convertJSONToMemberId(json.id);
  const userAccountId = convertJSONToUserAccountId(json.userAccountId);
  return Member.of(id, userAccountId, json.memberRole);
}

export { type MemberRole, Member, MemberTypeSymbol, convertJSONToMember };
