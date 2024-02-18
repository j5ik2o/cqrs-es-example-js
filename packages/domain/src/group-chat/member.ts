import { UserAccountId } from "../user-account";

type MemberRole = "admin" | "member";

const MemberSymbol = Symbol("Member");

type Member = Readonly<{
  symbol: typeof MemberSymbol;
  userAccountId: UserAccountId;
  memberRole: MemberRole;
  isAdministrator: () => boolean;
  isMember: () => boolean;
  equals: (other: Member) => boolean;
}>;

function initialize(
  userAccountId: UserAccountId,
  memberRole: MemberRole,
): Member {
  return {
    symbol: MemberSymbol,
    userAccountId,
    memberRole,
    isAdministrator() {
      return memberRole === "admin";
    },
    isMember() {
      return memberRole === "member";
    },
    equals(other: Member) {
      return userAccountId.value === other.userAccountId.value;
    },
  };
}

const Member = {
  of(userAccountId: UserAccountId, memberRole: MemberRole): Member {
    return initialize(userAccountId, memberRole);
  },
};

export { MemberRole, Member };
