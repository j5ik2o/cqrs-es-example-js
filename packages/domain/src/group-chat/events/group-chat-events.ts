import { Event } from "event-store-adapter-js";
import { GroupChatId } from "../group-chat-id";
import { UserAccountId } from "../../user-account";
import { GroupChatName } from "../group-chat-name";
import { Members } from "../members";
import { ulid } from "ulidx";
import { Member } from "../member";

interface GroupChatEvent extends Event<GroupChatId> {
  get executorId(): UserAccountId;
}

const GroupChatCreatedSymbol = Symbol("GroupChatCreated");

class GroupChatCreated implements GroupChatEvent {
  readonly symbol: typeof GroupChatCreatedSymbol = GroupChatCreatedSymbol;
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  static of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatCreated {
    return new GroupChatCreated(
      ulid(),
      aggregateId,
      name,
      members,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }

  get isCreated(): boolean {
    return true;
  }
}
const GroupChatMemberAddedSymbol = Symbol("GroupChatMemberAdded");
class GroupChatMemberAdded implements GroupChatEvent {
  readonly symbol: typeof GroupChatMemberAddedSymbol =
    GroupChatMemberAddedSymbol;
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly member: Member,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  static of(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberAdded {
    return new GroupChatMemberAdded(
      ulid(),
      aggregateId,
      member,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }

  get isCreated(): boolean {
    return false;
  }
}

export { GroupChatEvent, GroupChatCreated, GroupChatMemberAdded };
