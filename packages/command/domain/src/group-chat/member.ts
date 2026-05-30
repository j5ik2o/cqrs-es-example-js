import {
  type UserAccountId,
  type UserAccountIdJson,
  convertJSONToUserAccountId,
} from "../user-account";
import {
  type MemberId,
  type MemberIdJson,
  convertJSONToMemberId,
} from "./member-id";

const MEMBER_BRAND: unique symbol = Symbol("Member");

export type MemberRole = "administrator" | "member";

export type MemberJson = {
  id: MemberIdJson;
  userAccountId: UserAccountIdJson;
  memberRole: MemberRole;
};

export type Member = {
  id: MemberId;
  userAccountId: UserAccountId;
  memberRole: MemberRole;
  readonly [MEMBER_BRAND]: true;
};

export namespace Member {
  export function of(
    id: MemberId,
    userAccountId: UserAccountId,
    memberRole: MemberRole,
  ): Member {
    return Object.freeze({
      [MEMBER_BRAND]: true as const,
      id,
      userAccountId,
      memberRole,
    });
  }

  export function isAdministrator(member: Member): boolean {
    return member.memberRole === "administrator";
  }

  export function isMember(member: Member): boolean {
    return member.memberRole === "member";
  }

  export function withRole(member: Member, memberRole: MemberRole): Member {
    return of(member.id, member.userAccountId, memberRole);
  }

  export function equals(a: Member, b: Member): boolean {
    return a.userAccountId.value === b.userAccountId.value;
  }

  export function toJSON(member: Member): MemberJson {
    return {
      id: { value: member.id.value },
      userAccountId: { value: member.userAccountId.value },
      memberRole: member.memberRole,
    };
  }

  export function fromJSON(json: unknown): Member {
    if (
      typeof json !== "object" ||
      json === null ||
      !("id" in json) ||
      !("userAccountId" in json) ||
      !("memberRole" in json)
    ) {
      throw new Error("Invalid Member JSON");
    }
    const memberRole = json.memberRole;
    if (memberRole !== "administrator" && memberRole !== "member") {
      throw new Error(`Invalid member role: ${String(memberRole)}`);
    }
    return of(
      convertJSONToMemberId(json.id),
      convertJSONToUserAccountId(json.userAccountId),
      memberRole,
    );
  }
}

export const convertJSONToMember = Member.fromJSON;
