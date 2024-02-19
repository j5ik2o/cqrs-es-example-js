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

function convertJSONToMember(jsonString: string): Member {
  const obj = JSON.parse(jsonString);
  const id = convertJSONToUserAccountId(JSON.stringify(obj.userAccountId));
  return Member.of(id, obj.memberRole);
}

export {
  MemberRole,
  Member,
  MemberTypeSymbol,
  convertJSONToMember,
};
