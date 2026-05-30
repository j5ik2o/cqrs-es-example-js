import { Result } from "event-store-adapter-js/dist/result";
import type { UserAccountId } from "../user-account";
import { GroupChatError } from "./group-chat-errors";
import {
  GroupChatCreated,
  GroupChatDeleted,
  type GroupChatEvent,
  GroupChatMemberAdded,
  GroupChatMemberRemoved,
  GroupChatMessageDeleted,
  GroupChatMessagePosted,
  GroupChatRenamed,
} from "./group-chat-events";
import {
  type GroupChatId,
  type GroupChatIdJson,
  convertJSONToGroupChatId,
} from "./group-chat-id";
import {
  type GroupChatName,
  type GroupChatNameJson,
  convertJSONToGroupChatName,
} from "./group-chat-name";
import { Member, type MemberRole } from "./member";
import { MemberId } from "./member-id";
import { Members, type MembersJson, convertJSONToMembers } from "./members";
import type { Message } from "./message";
import type { MessageId } from "./message-id";
import { Messages, type MessagesJson, convertJSONToMessages } from "./messages";

const GROUP_CHAT_BRAND: unique symbol = Symbol("GroupChat");

type GroupChatParams = {
  id: GroupChatId;
  deleted: boolean;
  name: GroupChatName;
  members: Members;
  messages: Messages;
  sequenceNumber: number;
  version: number;
};

export type GroupChatSnapshotJson = {
  typeName: "GroupChat";
  id: GroupChatIdJson;
  deleted: boolean;
  name: GroupChatNameJson;
  members: MembersJson;
  messages: MessagesJson;
  sequenceNumber: number;
  version: number;
};

export type GroupChat = {
  typeName: "GroupChat";
  id: GroupChatId;
  sequenceNumber: number;
  version: number;
  deleted: boolean;
  name: GroupChatName;
  members: Members;
  messages: Messages;
  rename(
    name: GroupChatName,
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatRenamed], GroupChatError>;
  addMember(
    userAccountId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatMemberAdded], GroupChatError>;
  removeMemberById(
    userAccountId: UserAccountId,
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatMemberRemoved], GroupChatError>;
  postMessage(
    message: Message,
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatMessagePosted], GroupChatError>;
  deleteMessage(
    messageId: MessageId,
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatMessageDeleted], GroupChatError>;
  delete(
    executorId: UserAccountId,
  ): Result<[GroupChat, GroupChatDeleted], GroupChatError>;
  withVersion(version: number): GroupChat;
  updateVersion(version: (value: number) => number): GroupChat;
  readonly [GROUP_CHAT_BRAND]: true;
};

function paramsOf(self: GroupChat): GroupChatParams {
  return {
    id: self.id,
    deleted: self.deleted,
    name: self.name,
    members: self.members,
    messages: self.messages,
    sequenceNumber: self.sequenceNumber,
    version: self.version,
  };
}

function make(params: GroupChatParams): GroupChat {
  return Object.freeze({
    [GROUP_CHAT_BRAND]: true as const,
    typeName: "GroupChat",
    id: params.id,
    deleted: params.deleted,
    name: params.name,
    members: params.members,
    messages: params.messages,
    sequenceNumber: params.sequenceNumber,
    version: params.version,

    withVersion(version: number): GroupChat {
      return make({ ...params, version });
    },
    updateVersion(version: (value: number) => number): GroupChat {
      return make({ ...params, version: version(params.version) });
    },

    rename(
      name: GroupChatName,
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatRenamed], GroupChatError> {
      if (params.deleted) {
        return Result.err(GroupChatError.rename("The group chat is deleted"));
      }
      if (!Members.isAdministrator(params.members, executorId)) {
        return Result.err(
          GroupChatError.rename(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      if (params.name.value === name.value) {
        return Result.err(
          GroupChatError.rename("The new name is the same as the old name"),
        );
      }
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, name, sequenceNumber });
      const event = GroupChatRenamed.of(
        params.id,
        name,
        executorId,
        sequenceNumber,
      );
      return Result.ok([newGroupChat, event]);
    },

    addMember(
      userAccountId: UserAccountId,
      memberRole: MemberRole,
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatMemberAdded], GroupChatError> {
      if (params.deleted) {
        return Result.err(
          GroupChatError.addMember("The group chat is deleted"),
        );
      }
      if (Members.containsById(params.members, userAccountId)) {
        return Result.err(
          GroupChatError.addMember(
            "The userAccountId is already the member of the group chat",
          ),
        );
      }
      if (!Members.isAdministrator(params.members, executorId)) {
        return Result.err(
          GroupChatError.addMember(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const newMember = Member.of(
        MemberId.generate(),
        userAccountId,
        memberRole,
      );
      const members = Members.addMember(params.members, newMember);
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, members, sequenceNumber });
      const event = GroupChatMemberAdded.of(
        params.id,
        newMember,
        executorId,
        sequenceNumber,
      );
      return Result.ok([newGroupChat, event]);
    },

    removeMemberById(
      userAccountId: UserAccountId,
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatMemberRemoved], GroupChatError> {
      if (params.deleted) {
        return Result.err(
          GroupChatError.removeMember("The group chat is deleted"),
        );
      }
      const removed = Members.removeMemberById(params.members, userAccountId);
      if (removed === undefined) {
        return Result.err(
          GroupChatError.removeMember(
            "The userAccountId is not the member of the group chat",
          ),
        );
      }
      const [members, removedMember] = removed;
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, members, sequenceNumber });
      const event = GroupChatMemberRemoved.of(
        params.id,
        removedMember,
        executorId,
        sequenceNumber,
      );
      return Result.ok([newGroupChat, event]);
    },

    postMessage(
      message: Message,
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatMessagePosted], GroupChatError> {
      if (params.deleted) {
        return Result.err(
          GroupChatError.postMessage("The group chat is deleted"),
        );
      }
      if (!Members.containsById(params.members, executorId)) {
        return Result.err(
          GroupChatError.postMessage(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      if (!Members.containsById(params.members, message.senderId)) {
        return Result.err(
          GroupChatError.postMessage(
            "The sender id is not the member of the group chat",
          ),
        );
      }
      if (Messages.containsById(params.messages, message.id)) {
        return Result.err(
          GroupChatError.postMessage(
            "The message id is already exists in the group chat",
          ),
        );
      }
      const messages = Messages.addMessage(params.messages, message);
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, messages, sequenceNumber });
      const event = GroupChatMessagePosted.of(
        params.id,
        message,
        executorId,
        sequenceNumber,
      );
      return Result.ok([newGroupChat, event]);
    },

    deleteMessage(
      messageId: MessageId,
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatMessageDeleted], GroupChatError> {
      if (params.deleted) {
        return Result.err(
          GroupChatError.deleteMessage("The group chat is deleted"),
        );
      }
      if (!Members.containsById(params.members, executorId)) {
        return Result.err(
          GroupChatError.deleteMessage(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const removed = Messages.removeMessageById(params.messages, messageId);
      if (removed === undefined) {
        return Result.err(
          GroupChatError.deleteMessage(
            "The message id is not exists in the group chat",
          ),
        );
      }
      const [messages, removedMessage] = removed;
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, messages, sequenceNumber });
      const event = GroupChatMessageDeleted.of(
        params.id,
        removedMessage,
        executorId,
        sequenceNumber,
      );
      return Result.ok([newGroupChat, event]);
    },

    delete(
      executorId: UserAccountId,
    ): Result<[GroupChat, GroupChatDeleted], GroupChatError> {
      if (params.deleted) {
        return Result.err(
          GroupChatError.deleteGroupChat("The group chat is deleted"),
        );
      }
      if (!Members.isAdministrator(params.members, executorId)) {
        return Result.err(
          GroupChatError.deleteGroupChat(
            "The executorId is not the member of the group chat",
          ),
        );
      }
      const sequenceNumber = params.sequenceNumber + 1;
      const newGroupChat = make({ ...params, deleted: true, sequenceNumber });
      const event = GroupChatDeleted.of(params.id, executorId, sequenceNumber);
      return Result.ok([newGroupChat, event]);
    },
  });
}

function applyEvent(self: GroupChat, event: GroupChatEvent): GroupChat {
  const base = paramsOf(self);
  switch (event.typeName) {
    case "GroupChatCreated":
      return self;
    case "GroupChatRenamed":
      return make({
        ...base,
        name: event.name,
        sequenceNumber: event.sequenceNumber,
      });
    case "GroupChatMemberAdded":
      return make({
        ...base,
        members: Members.addMember(base.members, event.member),
        sequenceNumber: event.sequenceNumber,
      });
    case "GroupChatMemberRemoved": {
      const removed = Members.removeMemberById(
        base.members,
        event.member.userAccountId,
      );
      return make({
        ...base,
        members: removed === undefined ? base.members : removed[0],
        sequenceNumber: event.sequenceNumber,
      });
    }
    case "GroupChatMessagePosted":
      return make({
        ...base,
        messages: Messages.addMessage(base.messages, event.message),
        sequenceNumber: event.sequenceNumber,
      });
    case "GroupChatMessageDeleted": {
      const removed = Messages.removeMessageById(
        base.messages,
        event.message.id,
      );
      return make({
        ...base,
        messages: removed === undefined ? base.messages : removed[0],
        sequenceNumber: event.sequenceNumber,
      });
    }
    case "GroupChatDeleted":
      return make({
        ...base,
        deleted: true,
        sequenceNumber: event.sequenceNumber,
      });
    default: {
      const exhaustive: never = event;
      throw new Error(`Unknown GroupChatEvent: ${String(exhaustive)}`);
    }
  }
}

export namespace GroupChat {
  export function of(params: GroupChatParams): GroupChat {
    return make(params);
  }

  export function create(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): [GroupChat, GroupChatCreated] {
    const members = Members.ofSingle(executorId);
    const sequenceNumber = 1;
    const version = 1;
    const groupChat = make({
      id,
      deleted: false,
      name,
      members,
      messages: Messages.ofEmpty(),
      sequenceNumber,
      version,
    });
    const event = GroupChatCreated.of(
      id,
      name,
      members,
      executorId,
      sequenceNumber,
    );
    return [groupChat, event];
  }

  export function replay(
    events: readonly GroupChatEvent[],
    snapshot: GroupChat,
  ): GroupChat {
    return events.reduce((self, event) => applyEvent(self, event), snapshot);
  }

  export function replayFromEvents(
    events: readonly GroupChatEvent[],
  ): GroupChat | undefined {
    const [first, ...rest] = events;
    if (first === undefined) {
      return undefined;
    }
    if (first.typeName !== "GroupChatCreated") {
      throw new Error("GroupChat history must start with GroupChatCreated");
    }
    const initial = make({
      id: first.aggregateId,
      deleted: false,
      name: first.name,
      members: first.members,
      messages: Messages.ofEmpty(),
      sequenceNumber: first.sequenceNumber,
      version: 1,
    });
    return rest.reduce((self, event) => applyEvent(self, event), initial);
  }

  export function is(value: unknown): value is GroupChat {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    return (value as Partial<GroupChat>)[GROUP_CHAT_BRAND] === true;
  }

  export function toJSON(self: GroupChat): GroupChatSnapshotJson {
    return {
      typeName: "GroupChat",
      id: { value: self.id.value },
      deleted: self.deleted,
      name: { value: self.name.value },
      members: { values: self.members.values.map((m) => Member.toJSON(m)) },
      messages: Messages.toJSON(self.messages),
      sequenceNumber: self.sequenceNumber,
      version: self.version,
    };
  }

  export function fromJSON(json: unknown): GroupChat {
    const data = unwrapSnapshot(json);
    return make({
      id: convertJSONToGroupChatId(data.id),
      deleted: Boolean(data.deleted),
      name: convertJSONToGroupChatName(data.name),
      members: convertJSONToMembers(data.members),
      messages: convertJSONToMessages(data.messages),
      sequenceNumber: Number(data.sequenceNumber),
      version: Number(data.version),
    });
  }
}

export const convertJSONToGroupChat = GroupChat.fromJSON;

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON payload from the snapshot store
function unwrapSnapshot(json: unknown): any {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid GroupChat JSON");
  }
  if ("type" in json && "data" in json) {
    return json.data;
  }
  return json;
}
