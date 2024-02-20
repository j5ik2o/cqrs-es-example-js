import { Event } from "event-store-adapter-js";
import { convertJSONToGroupChatId, GroupChatId } from "./group-chat-id";
import { convertJSONToUserAccountId, UserAccountId } from "../user-account";
import { convertJSONToGroupChatName, GroupChatName } from "./group-chat-name";
import { convertJSONToMembers, Members } from "./members";
import { ulid } from "ulidx";
import { convertJSONToMember, Member } from "./member";
import { convertJSONToMessage, Message } from "./message";

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
      typeName: "GroupChatCreated",
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
      typeName: "GroupChatRenamed",
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
      typeName: "GroupChatMemberAdded",
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
      typeName: "GroupChatMemberRemoved",
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
      typeName: "GroupChatDeleted",
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
      typeName: "GroupChatMessagePosted",
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
      typeName: "GroupChatMessageDeleted",
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertJSONToGroupChatEvent(json: any): GroupChatEvent {
  const id = convertJSONToGroupChatId(json.data.aggregateId);
  const executorId = convertJSONToUserAccountId(json.data.executorId);
  switch (json.type) {
    case "GroupChatCreated": {
      const name = convertJSONToGroupChatName(json.data.name);
      const members = convertJSONToMembers(json.data.members);
      return GroupChatCreated.of(
        id,
        name,
        members,
        executorId,
        json.data.sequenceNumber,
      );
    }
    case "GroupChatRenamed": {
      const name = convertJSONToGroupChatName(json.data.name);
      return GroupChatRenamed.of(
        id,
        name,
        executorId,
        json.data.sequenceNumber,
      );
    }
    case "GroupChatMemberAdded": {
      const member = convertJSONToMember(json.data.member);
      return GroupChatMemberAdded.of(
        id,
        member,
        executorId,
        json.sequenceNumber,
      );
    }
    case "GroupChatMemberRemoved": {
      const member = convertJSONToMember(json.data.member);
      return GroupChatMemberRemoved.of(
        id,
        member,
        executorId,
        json.sequenceNumber,
      );
    }
    case "GroupChatMessagePosted": {
      const message = convertJSONToMessage(json.data.message);
      return GroupChatMessagePosted.of(
        id,
        message,
        executorId,
        json.sequenceNumber,
      );
    }
    case "GroupChatMessageDeleted": {
      const message = convertJSONToMessage(json.data.message);
      return GroupChatMessageDeleted.of(
        id,
        message,
        executorId,
        json.sequenceNumber,
      );
    }
    case "GroupChatDeleted": {
      return GroupChatDeleted.of(id, executorId, json.sequenceNumber);
    }
    default:
      throw new Error(`Unknown type: ${json.type}`);
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
