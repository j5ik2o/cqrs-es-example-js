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

const GroupChatCreatedTypeSymbol = Symbol("GroupChatCreated");

interface GroupChatCreated extends GroupChatEvent {
  symbol: typeof GroupChatCreatedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  name: GroupChatName;
  members: Members;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatCreated = {
  of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatCreated {
    return {
      symbol: GroupChatCreatedTypeSymbol,
      id: ulid(),
      aggregateId,
      name,
      members,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: true,
    };
  },
};

const GroupChatMemberAddedTypeSymbol = Symbol("GroupChatMemberAdded");

interface GroupChatMemberAdded extends GroupChatEvent {
  symbol: typeof GroupChatMemberAddedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  member: Member;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatMemberAdded = {
  of(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberAdded {
    return {
      symbol: GroupChatMemberAddedTypeSymbol,
      id: ulid(),
      aggregateId,
      member,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
    };
  },
};

const GroupChatMemberRemovedTypeSymbol = Symbol("GroupChatMemberRemoved");

interface GroupChatMemberRemoved extends GroupChatEvent {
  symbol: typeof GroupChatMemberRemovedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  member: Member;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatMemberRemoved = {
  of(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberRemoved {
    return {
      symbol: GroupChatMemberRemovedTypeSymbol,
      id: ulid(),
      aggregateId,
      member,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
    };
  },
};

const GroupChatDeletedTypeSymbol = Symbol("GroupChatDeleted");

interface GroupChatDeleted extends GroupChatEvent {
  symbol: typeof GroupChatDeletedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatDeleted = {
  of(
    aggregateId: GroupChatId,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatDeleted {
    return {
      symbol: GroupChatDeletedTypeSymbol,
      id: ulid(),
      aggregateId,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
    };
  },
};

const GroupChatMessagePostedTypeSymbol = Symbol("GroupChatMessagePosted");

interface GroupChatMessagePosted extends GroupChatEvent {
  symbol: typeof GroupChatMessagePostedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  message: Message;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatMessagePosted = {
  of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessagePosted {
    return {
      symbol: GroupChatMessagePostedTypeSymbol,
      id: ulid(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
    };
  },
};

const GroupChatMessageDeletedTypeSymbol = Symbol("GroupChatMessageDeleted");

interface GroupChatMessageDeleted extends GroupChatEvent {
  symbol: typeof GroupChatMessageDeletedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  message: Message;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatMessageDeleted = {
  of(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessageDeleted {
    return {
      symbol: GroupChatMessageDeletedTypeSymbol,
      id: ulid(),
      aggregateId,
      message,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
    };
  },
};

export {
  GroupChatEvent,
  GroupChatCreated,
  GroupChatCreatedTypeSymbol,
  GroupChatMemberAdded,
  GroupChatMemberAddedTypeSymbol,
  GroupChatMemberRemoved,
  GroupChatMemberRemovedTypeSymbol,
  GroupChatMessagePosted,
  GroupChatMessagePostedTypeSymbol,
  GroupChatMessageDeleted,
  GroupChatMessageDeletedTypeSymbol,
  GroupChatDeleted,
  GroupChatDeletedTypeSymbol,
};
