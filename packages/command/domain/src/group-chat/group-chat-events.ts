import { Event } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { UserAccountId } from "../user-account";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { ulid } from "ulidx";
import { Member } from "./member";
import { Message } from "./message";

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
  executorId: UserAccountId;
  toString: () => string;
}

const GroupChatCreatedTypeSymbol = Symbol("GroupChatCreated");

class GroupChatCreated implements GroupChatEvent {
  readonly symbol: typeof GroupChatCreatedTypeSymbol =
    GroupChatCreatedTypeSymbol;
  readonly typeName = "GroupChatCreated";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}

  isCreated: boolean = true;

  toString() {
    return `GroupChatCreated(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.name.toString()}, ${this.members.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

const GroupChatRenamedTypeSymbol = Symbol("GroupChatRenamed");

class GroupChatRenamed implements GroupChatEvent {
  readonly symbol: typeof GroupChatRenamedTypeSymbol =
    GroupChatRenamedTypeSymbol;
  readonly typeName = "GroupChatRenamed";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly name: GroupChatName,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatRenamed(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.name.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }
  static of(
    aggregateId: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatRenamed {
    return new GroupChatRenamed(
      ulid(),
      aggregateId,
      name,
      executorId,
      sequenceNumber,
      new Date(),
    );
  }
}

const GroupChatMemberAddedTypeSymbol = Symbol("GroupChatMemberAdded");

class GroupChatMemberAdded implements GroupChatEvent {
  readonly symbol: typeof GroupChatMemberAddedTypeSymbol =
    GroupChatMemberAddedTypeSymbol;
  readonly typeName = "GroupChatMemberAdded";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly member: Member,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatMemberAdded(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.member.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

const GroupChatMemberRemovedTypeSymbol = Symbol("GroupChatMemberRemoved");

class GroupChatMemberRemoved implements GroupChatEvent {
  readonly symbol: typeof GroupChatMemberRemovedTypeSymbol =
    GroupChatMemberRemovedTypeSymbol;
  readonly typeName = "GroupChatMemberRemoved";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly member: Member,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatMemberRemoved(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.member.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

const GroupChatDeletedTypeSymbol = Symbol("GroupChatDeleted");

class GroupChatDeleted implements GroupChatEvent {
  readonly symbol: typeof GroupChatDeletedTypeSymbol =
    GroupChatDeletedTypeSymbol;
  readonly typeName = "GroupChatDeleted";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatDeleted(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

const GroupChatMessagePostedTypeSymbol = Symbol("GroupChatMessagePosted");

class GroupChatMessagePosted implements GroupChatEvent {
  readonly symbol: typeof GroupChatMessagePostedTypeSymbol =
    GroupChatMessagePostedTypeSymbol;
  readonly typeName = "GroupChatMessagePosted";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly message: Message,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatMessagePosted(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.message.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

const GroupChatMessageDeletedTypeSymbol = Symbol("GroupChatMessageDeleted");

class GroupChatMessageDeleted implements GroupChatEvent {
  symbol: typeof GroupChatMessageDeletedTypeSymbol =
    GroupChatMessageDeletedTypeSymbol;
  typeName = "GroupChatMessageDeleted";
  private constructor(
    public readonly id: string,
    public readonly aggregateId: GroupChatId,
    public readonly message: Message,
    public readonly executorId: UserAccountId,
    public readonly sequenceNumber: number,
    public readonly occurredAt: Date,
  ) {}
  isCreated: boolean = false;
  toString() {
    return `GroupChatMessageDeleted(${this.id.toString()}, ${this.aggregateId.toString()}, ${this.message.toString()}, ${this.executorId.toString()}, ${this.sequenceNumber}, ${this.occurredAt.toISOString()})`;
  }

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
}

class GroupChatEventFactory {
  static ofGroupChatCreated(
    aggregateId: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatCreated {
    return GroupChatCreated.of(
      aggregateId,
      name,
      members,
      executorId,
      sequenceNumber,
    );
  }
  static ofGroupChatRenamed(
    aggregateId: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatRenamed {
    return GroupChatRenamed.of(aggregateId, name, executorId, sequenceNumber);
  }

  static ofGroupChatMemberAdded(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberAdded {
    return GroupChatMemberAdded.of(
      aggregateId,
      member,
      executorId,
      sequenceNumber,
    );
  }

  static ofGroupChatMemberRemoved(
    aggregateId: GroupChatId,
    member: Member,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMemberRemoved {
    return GroupChatMemberRemoved.of(
      aggregateId,
      member,
      executorId,
      sequenceNumber,
    );
  }

  static ofGroupChatMessagePosted(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessagePosted {
    return GroupChatMessagePosted.of(
      aggregateId,
      message,
      executorId,
      sequenceNumber,
    );
  }

  static ofGroupChatMessageDeleted(
    aggregateId: GroupChatId,
    message: Message,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatMessageDeleted {
    return GroupChatMessageDeleted.of(
      aggregateId,
      message,
      executorId,
      sequenceNumber,
    );
  }

  static ofGroupChatDeleted(
    aggregateId: GroupChatId,
    executorId: UserAccountId,
    sequenceNumber: number,
  ): GroupChatDeleted {
    return GroupChatDeleted.of(aggregateId, executorId, sequenceNumber);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static convertJSONToGroupChatEvent(json: any): GroupChatEvent {
    const id = GroupChatId.convertJSONToGroupChatId(json.data.aggregateId);
    const executorId = UserAccountId.convertJSONToUserAccountId(json.data.executorId);
    switch (json.type) {
      case "GroupChatCreated": {
        const name = GroupChatName.convertJSONToGroupChatName(json.data.name);
        const members = Members.convertJSONToMembers(json.data.members);
        return GroupChatCreated.of(
          id,
          name,
          members,
          executorId,
          json.data.sequenceNumber,
        );
      }
      case "GroupChatRenamed": {
        const name = GroupChatName.convertJSONToGroupChatName(json.data.name);
        return GroupChatRenamed.of(
          id,
          name,
          executorId,
          json.data.sequenceNumber,
        );
      }
      case "GroupChatMemberAdded": {
        const member = Member.convertJSONToMember(json.data.member);
        return GroupChatMemberAdded.of(
          id,
          member,
          executorId,
          json.sequenceNumber,
        );
      }
      case "GroupChatMemberRemoved": {
        const member = Member.convertJSONToMember(json.data.member);
        return GroupChatMemberRemoved.of(
          id,
          member,
          executorId,
          json.sequenceNumber,
        );
      }
      case "GroupChatMessagePosted": {
        const message = Message.convertJSONToMessage(json.data.message);
        return GroupChatMessagePosted.of(
          id,
          message,
          executorId,
          json.sequenceNumber,
        );
      }
      case "GroupChatMessageDeleted": {
        const message = Message.convertJSONToMessage(json.data.message);
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
  GroupChatEventFactory,
};
