import { Event } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { UserAccountId } from "../user-account";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { ulid } from "ulidx";
import { Member } from "./member";
import { Message } from "./message";

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

const GroupChatMemberRemovedSymbol = Symbol("GroupChatMemberRemoved");

class GroupChatMemberRemoved implements GroupChatEvent {
  readonly symbol: typeof GroupChatMemberRemovedSymbol =
    GroupChatMemberRemovedSymbol;
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
  ): GroupChatMemberRemoved {
    return new GroupChatMemberRemoved(
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

const GroupChatDeletedSymbol = Symbol("GroupChatDeleted");

class GroupChatDeleted implements GroupChatEvent {
  readonly symbol: typeof GroupChatDeletedSymbol = GroupChatDeletedSymbol;
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  static of(
    aggregateId: GroupChatId,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatDeleted {
    return new GroupChatDeleted(
      ulid(),
      aggregateId,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }

  get isCreated(): boolean {
    return false;
  }
}

const GroupChatMessagePostedSymbol = Symbol("GroupChatMessagePosted");

class GroupChatMessagePosted implements GroupChatEvent {
  readonly symbol: typeof GroupChatMessagePostedSymbol =
    GroupChatMessagePostedSymbol;
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly message: Message,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  static of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessagePosted {
    return new GroupChatMessagePosted(
      ulid(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }

  get isCreated(): boolean {
    return false;
  }
}

const GroupChatMessageDeletedSymbol = Symbol("GroupChatMessageDeleted");
class GroupChatMessageDeleted implements GroupChatEvent {
  readonly symbol: typeof GroupChatMessageDeletedSymbol =
    GroupChatMessageDeletedSymbol;
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly message: Message,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  static of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessageDeleted {
    return new GroupChatMessageDeleted(
      ulid(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }

  get isCreated(): boolean {
    return false;
  }
}

export {
  GroupChatEvent,
  GroupChatCreated,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessagePosted,
  GroupChatMessageDeleted,
  GroupChatDeleted,
};
