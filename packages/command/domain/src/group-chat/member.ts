import { convertJSONToUserAccountId, UserAccountId } from "../user-account";

type MemberRole = "administrator" | "member";

const MemberTypeSymbol = Symbol("Member");

interface Member {
  symbol: typeof MemberTypeSymbol;
  userAccountId: UserAccountId;
  memberRole: MemberRole;
  isAdministrator: () => boolean;
  isMember: () => boolean;
  withRole: (role: MemberRole) => Member;
  equals: (other: Member) => boolean;
}

interface MemberParams {
  userAccountId: UserAccountId;
  memberRole: MemberRole;
}

function initialize(params: MemberParams): Member {
  return {
    symbol: MemberTypeSymbol,
    userAccountId: params.userAccountId,
    memberRole: params.memberRole,
    isAdministrator() {
      return this.memberRole === "administrator";
    },
    isMember() {
      return this.memberRole === "member";
    },
    withRole(role: MemberRole) {
      return initialize({ ...this, memberRole: role });
    },
    equals(other: Member) {
      return this.userAccountId.value === other.userAccountId.value;
    },
  };
}

const Member = {
  of(userAccountId: UserAccountId, memberRole: MemberRole): Member {
    return initialize({ userAccountId, memberRole });
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToMember(json: any): Member {
  const id = convertJSONToUserAccountId(json.userAccountId);
  return Member.of(id, json.memberRole);
}

export { MemberRole, Member, MemberTypeSymbol, convertJSONToMember };
