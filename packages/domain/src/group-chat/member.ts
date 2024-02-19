import { UserAccountId } from "../user-account";

const MemberSymbol = Symbol("Member");
const AdministratorSymbol = Symbol("Administrator");

type MemberRole = typeof AdministratorSymbol | typeof MemberSymbol;

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
      return this.memberRole === AdministratorSymbol;
    },
    isMember() {
      return this.memberRole === MemberSymbol;
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

export {
  MemberRole,
  MemberSymbol,
  AdministratorSymbol,
  Member,
  MemberTypeSymbol,
};
