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

function newMember(
  userAccountId: UserAccountId,
  memberRole: MemberRole,
): Member {
  return {
    symbol: MemberSymbol,
    userAccountId,
    memberRole,
    isAdministrator: () => memberRole === "admin",
    isMember: () => memberRole === "member",
    equals: (other: Member) =>
      userAccountId.value === other.userAccountId.value,
  };
}

const Member = {
  of(userAccountId: UserAccountId, memberRole: MemberRole): Member {
    return newMember(userAccountId, memberRole);
  },
};

export { MemberRole, Member };
