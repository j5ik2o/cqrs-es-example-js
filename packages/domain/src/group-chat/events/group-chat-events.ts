import { Event } from "event-store-adapter-js";
import { GroupChatId } from "../group-chat-id";
import { UserAccountId } from "../../user-account";
import { GroupChatName } from "../group-chat-name";
import { Members } from "../members";

interface GroupChatEvent extends Event<GroupChatId> {
  GetExecutorId(): UserAccountId;
}

class GroupChatCreated implements GroupChatEvent {
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
    id: string,
    aggregateId: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatCreated {
    return new GroupChatCreated(
      id,
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

  GetExecutorId(): UserAccountId {
    return this.executorId;
  }
}

export { GroupChatEvent, GroupChatCreated };
