import {
  GroupChat,
  type GroupChatError,
  type GroupChatEvent,
  GroupChatId,
  type GroupChatName,
  type MemberRole,
  type Message,
  type MessageId,
  type UserAccountId,
} from "cqrs-es-example-js-command-domain";
import type { GroupChatRepository } from "cqrs-es-example-js-command-interface-adaptor-if";
import { type EventStoreError, Result } from "event-store-adapter-js";

// --- ProcessError ---------------------------------------------------------

const PROCESS_ERROR_BRAND: unique symbol = Symbol("ProcessError");

export type ProcessError = {
  kind: "not-found" | "optimistic-lock" | "domain" | "internal";
  message: string;
  domainError?: GroupChatError;
  cause?: unknown;
  readonly [PROCESS_ERROR_BRAND]: true;
};

export namespace ProcessError {
  export function notFound(message: string): ProcessError {
    return Object.freeze({
      [PROCESS_ERROR_BRAND]: true as const,
      kind: "not-found",
      message,
    });
  }

  export function optimisticLock(
    message: string,
    cause?: unknown,
  ): ProcessError {
    return Object.freeze({
      [PROCESS_ERROR_BRAND]: true as const,
      kind: "optimistic-lock",
      message,
      cause,
    });
  }

  export function domain(error: GroupChatError): ProcessError {
    return Object.freeze({
      [PROCESS_ERROR_BRAND]: true as const,
      kind: "domain",
      message: error.message,
      domainError: error,
    });
  }

  export function internal(message: string, cause?: unknown): ProcessError {
    return Object.freeze({
      [PROCESS_ERROR_BRAND]: true as const,
      kind: "internal",
      message,
      cause,
    });
  }

  export function is(value: unknown): value is ProcessError {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    return (value as Partial<ProcessError>)[PROCESS_ERROR_BRAND] === true;
  }
}

function fromEventStoreError(error: EventStoreError): ProcessError {
  if (error.type === "optimistic-lock-conflict") {
    return ProcessError.optimisticLock(error.message, error);
  }
  return ProcessError.internal(error.message, error);
}

// --- Processor ------------------------------------------------------------

export type GroupChatCommandProcessor = {
  createGroupChat(
    name: GroupChatName,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  deleteGroupChat(
    id: GroupChatId,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  renameGroupChat(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  addMemberToGroupChat(
    id: GroupChatId,
    memberId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  removeMemberFromGroupChat(
    id: GroupChatId,
    memberId: UserAccountId,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  postMessageToGroupChat(
    id: GroupChatId,
    message: Message,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
  deleteMessageFromGroupChat(
    id: GroupChatId,
    messageId: MessageId,
    executorId: UserAccountId,
  ): Promise<Result<GroupChatEvent, ProcessError>>;
};

export namespace GroupChatCommandProcessor {
  export function create(
    repository: GroupChatRepository,
  ): GroupChatCommandProcessor {
    async function persist(
      event: GroupChatEvent,
      snapshot: GroupChat,
    ): Promise<Result<GroupChatEvent, ProcessError>> {
      let storeResult: Result<void, EventStoreError>;
      try {
        storeResult = await repository.store(event, snapshot);
      } catch (error) {
        return Result.err(
          ProcessError.internal("Failed to store the group chat event", error),
        );
      }
      if (storeResult.type === "err") {
        return Result.err(fromEventStoreError(storeResult.error));
      }
      return Result.ok(event);
    }

    async function mutate(
      id: GroupChatId,
      operate: (
        groupChat: GroupChat,
      ) => Result<[GroupChat, GroupChatEvent], GroupChatError>,
    ): Promise<Result<GroupChatEvent, ProcessError>> {
      let groupChat: GroupChat | undefined;
      try {
        groupChat = await repository.findById(id);
      } catch (error) {
        return Result.err(
          ProcessError.internal("Failed to find the group chat", error),
        );
      }
      if (groupChat === undefined) {
        return Result.err(ProcessError.notFound("Group chat not found"));
      }
      const operated = operate(groupChat);
      if (operated.type === "err") {
        return Result.err(ProcessError.domain(operated.error));
      }
      const [newGroupChat, event] = operated.value;
      return persist(event, newGroupChat);
    }

    return Object.freeze({
      async createGroupChat(
        name: GroupChatName,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        const id = GroupChatId.generate();
        const [groupChat, event] = GroupChat.create(id, name, executorId);
        return persist(event, groupChat);
      },

      deleteGroupChat(
        id: GroupChatId,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) => groupChat.delete(executorId));
      },

      renameGroupChat(
        id: GroupChatId,
        name: GroupChatName,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) => groupChat.rename(name, executorId));
      },

      addMemberToGroupChat(
        id: GroupChatId,
        memberId: UserAccountId,
        memberRole: MemberRole,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) =>
          groupChat.addMember(memberId, memberRole, executorId),
        );
      },

      removeMemberFromGroupChat(
        id: GroupChatId,
        memberId: UserAccountId,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) =>
          groupChat.removeMemberById(memberId, executorId),
        );
      },

      postMessageToGroupChat(
        id: GroupChatId,
        message: Message,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) =>
          groupChat.postMessage(message, executorId),
        );
      },

      deleteMessageFromGroupChat(
        id: GroupChatId,
        messageId: MessageId,
        executorId: UserAccountId,
      ): Promise<Result<GroupChatEvent, ProcessError>> {
        return mutate(id, (groupChat) =>
          groupChat.deleteMessage(messageId, executorId),
        );
      },
    });
  }
}
