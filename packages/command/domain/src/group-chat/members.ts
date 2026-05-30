import type { UserAccountId } from "../user-account";
import { Member, type MemberJson, convertJSONToMember } from "./member";
import { MemberId } from "./member-id";

const MEMBERS_BRAND: unique symbol = Symbol("Members");

export type MembersJson = {
  values: MemberJson[];
};

export type Members = {
  values: readonly Member[];
  readonly [MEMBERS_BRAND]: true;
};

export namespace Members {
  export function fromArray(values: readonly Member[]): Members {
    // Preserve the uniqueness invariant (one member per userAccountId), keeping
    // the first occurrence so the creator/administrator stays first.
    const deduped: Member[] = [];
    const seen = new Set<string>();
    for (const member of values) {
      if (!seen.has(member.userAccountId.value)) {
        seen.add(member.userAccountId.value);
        deduped.push(member);
      }
    }
    if (deduped.length === 0) {
      throw new Error("Members cannot be empty");
    }
    return Object.freeze({
      [MEMBERS_BRAND]: true as const,
      values: Object.freeze(deduped),
    });
  }

  export function ofSingle(userAccountId: UserAccountId): Members {
    return fromArray([
      Member.of(MemberId.generate(), userAccountId, "administrator"),
    ]);
  }

  export function addMember(members: Members, member: Member): Members {
    const withoutTarget = members.values.filter(
      (m) => m.userAccountId.value !== member.userAccountId.value,
    );
    return fromArray([...withoutTarget, member]);
  }

  export function removeMemberById(
    members: Members,
    userAccountId: UserAccountId,
  ): [Members, Member] | undefined {
    const target = findById(members, userAccountId);
    if (target === undefined) {
      return undefined;
    }
    const remaining = members.values.filter(
      (m) => m.userAccountId.value !== userAccountId.value,
    );
    return [fromArray(remaining), target];
  }

  export function findById(
    members: Members,
    userAccountId: UserAccountId,
  ): Member | undefined {
    return members.values.find(
      (m) => m.userAccountId.value === userAccountId.value,
    );
  }

  export function containsById(
    members: Members,
    userAccountId: UserAccountId,
  ): boolean {
    return findById(members, userAccountId) !== undefined;
  }

  export function isMember(
    members: Members,
    userAccountId: UserAccountId,
  ): boolean {
    const member = findById(members, userAccountId);
    return member !== undefined && Member.isMember(member);
  }

  export function isAdministrator(
    members: Members,
    userAccountId: UserAccountId,
  ): boolean {
    const member = findById(members, userAccountId);
    return member !== undefined && Member.isAdministrator(member);
  }

  export function toArray(members: Members): Member[] {
    return [...members.values];
  }

  export function equals(a: Members, b: Members): boolean {
    if (a.values.length !== b.values.length) {
      return false;
    }
    return a.values.every((member) => {
      const other = findById(b, member.userAccountId);
      return other !== undefined && Member.equals(member, other);
    });
  }

  export function toJSON(members: Members): MembersJson {
    return { values: members.values.map(Member.toJSON) };
  }

  export function fromJSON(json: unknown): Members {
    if (
      typeof json !== "object" ||
      json === null ||
      !("values" in json) ||
      !Array.isArray(json.values)
    ) {
      throw new Error("Invalid Members JSON");
    }
    return fromArray(json.values.map(convertJSONToMember));
  }
}

export const convertJSONToMembers = Members.fromJSON;
