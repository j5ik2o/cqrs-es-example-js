const GROUP_CHAT_ERROR_BRAND: unique symbol = Symbol("GroupChatError");

export type GroupChatErrorKind =
  | "rename"
  | "add-member"
  | "remove-member"
  | "post-message"
  | "delete-message"
  | "delete";

export type GroupChatError = {
  kind: GroupChatErrorKind;
  message: string;
  readonly [GROUP_CHAT_ERROR_BRAND]: true;
};

export namespace GroupChatError {
  function make(kind: GroupChatErrorKind, message: string): GroupChatError {
    return Object.freeze({
      [GROUP_CHAT_ERROR_BRAND]: true as const,
      kind,
      message,
    });
  }

  export function rename(message: string): GroupChatError {
    return make("rename", message);
  }

  export function addMember(message: string): GroupChatError {
    return make("add-member", message);
  }

  export function removeMember(message: string): GroupChatError {
    return make("remove-member", message);
  }

  export function postMessage(message: string): GroupChatError {
    return make("post-message", message);
  }

  export function deleteMessage(message: string): GroupChatError {
    return make("delete-message", message);
  }

  export function deleteGroupChat(message: string): GroupChatError {
    return make("delete", message);
  }

  export function is(value: unknown): value is GroupChatError {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    return (value as Partial<GroupChatError>)[GROUP_CHAT_ERROR_BRAND] === true;
  }
}
