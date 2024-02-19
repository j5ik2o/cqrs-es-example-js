import { Event } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { UserAccountId } from "../user-account";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { ulid } from "ulidx";
import { Member } from "./member";
import { Message } from "./message";
import { MessageId } from "./message-id";

type GroupChatEventTypeSymbol =
  | typeof GroupChatCreatedTypeSymbol
  | typeof GroupChatRenamedTypeSymbol
  | typeof GroupChatMemberAddedTypeSymbol
  | typeof GroupChatMemberRemovedTypeSymbol
  | typeof GroupChatMessagePostedTypeSymbol
  | typeof GroupChatMessageDeletedTypeSymbol
  | typeof GroupChatDeletedTypeSymbol;

interface GroupChatEvent extends Event<GroupChatId> {
  symbol: GroupChatEventTypeSymbol;

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
      typeName: GroupChatCreatedTypeSymbol.toString(),
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

const GroupChatRenamedTypeSymbol = Symbol("GroupChatRenamed");

interface GroupChatRenamed extends GroupChatEvent {
  symbol: typeof GroupChatRenamedTypeSymbol;
  id: string;
  aggregateId: GroupChatId;
  name: GroupChatName;
  executorId: UserAccountId;
  sequenceNumber: number;
  occurredAt: Date;
  isCreated: boolean;
}

const GroupChatRenamed = {
  of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatRenamed {
    return {
      symbol: GroupChatRenamedTypeSymbol,
      typeName: GroupChatRenamedTypeSymbol.toString(),
      id: ulid(),
      aggregateId,
      name,
      executorId,
      sequenceNumber,
      occurredAt: new Date(),
      isCreated: false,
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
      typeName: GroupChatMemberAddedTypeSymbol.toString(),
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
      typeName: GroupChatMemberRemovedTypeSymbol.toString(),
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
      typeName: GroupChatDeletedTypeSymbol.toString(),
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
      typeName: GroupChatMessagePostedTypeSymbol.toString(),
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
      typeName: GroupChatMessageDeletedTypeSymbol.toString(),
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

// eslint @typescript-eslint/no-explicit-any
function convertJSONToGroupChatEvent(jsonString: string): GroupChatEvent {
  const obj = JSON.parse(jsonString);
  switch (obj.symbol) {
    case GroupChatCreatedTypeSymbol:
      return GroupChatCreated.of(
        GroupChatId.of(obj.aggregateId.value),
        GroupChatName.of(obj.name.value),
        Members.fromArray(obj.members),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatRenamedTypeSymbol:
      return GroupChatRenamed.of(
        GroupChatId.of(obj.aggregateId.value),
        GroupChatName.of(obj.name.value),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatMemberAddedTypeSymbol:
      return GroupChatMemberAdded.of(
        GroupChatId.of(obj.aggregateId.value),
        Member.of(
          UserAccountId.of(obj.member.userAccountId.value),
          obj.member.isAdmin,
        ),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatMemberRemovedTypeSymbol:
      return GroupChatMemberRemoved.of(
        GroupChatId.of(obj.aggregateId.value),
        Member.of(
          UserAccountId.of(obj.member.userAccountId.value),
          obj.member.isAdmin,
        ),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatMessagePostedTypeSymbol:
      return GroupChatMessagePosted.of(
        GroupChatId.of(obj.aggregateId.value),
        Message.of(
          MessageId.of(obj.message.id.value),
          obj.message.context,
          UserAccountId.of(obj.message.sender.value),
          obj.message.sentAt,
        ),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatMessageDeletedTypeSymbol:
      return GroupChatMessageDeleted.of(
        GroupChatId.of(obj.aggregateId.value),
        Message.of(
          MessageId.of(obj.message.id.value),
          obj.message.context,
          UserAccountId.of(obj.message.sender.value),
          obj.message.sentAt,
        ),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    case GroupChatDeletedTypeSymbol:
      return GroupChatDeleted.of(
        GroupChatId.of(obj.aggregateId.value),
        UserAccountId.of(obj.executorId.value),
        obj.sequenceNumber,
      );
    default:
      throw new Error(`Unknown symbol: ${obj.symbol}`);
  }
}

export {
  GroupChatEvent,
  GroupChatEventTypeSymbol,
  GroupChatCreated,
  GroupChatCreatedTypeSymbol,
  GroupChatRenamed,
  GroupChatRenamedTypeSymbol,
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
  convertJSONToGroupChatEvent,
};
