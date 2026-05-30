import { Result } from "event-store-adapter-js";
import {
  type UserAccountId,
  type UserAccountIdJson,
  convertJSONToUserAccountId,
} from "../user-account";
import {
  type MessageId,
  type MessageIdJson,
  convertJSONToMessageId,
} from "./message-id";

const MESSAGE_BRAND: unique symbol = Symbol("Message");

export type MessageJson = {
  id: MessageIdJson;
  content: string;
  senderId: UserAccountIdJson;
  sentAt: string;
};

export type Message = {
  id: MessageId;
  content: string;
  senderId: UserAccountId;
  sentAt: Date;
  readonly [MESSAGE_BRAND]: true;
};

export namespace Message {
  export function of(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Message {
    if (Number.isNaN(sentAt.getTime())) {
      throw new Error("Message sentAt must be a valid Date");
    }
    return Object.freeze({
      [MESSAGE_BRAND]: true as const,
      id,
      content,
      senderId,
      sentAt,
    });
  }

  export function validate(
    id: MessageId,
    content: string,
    senderId: UserAccountId,
    sentAt: Date,
  ): Result<Message, string> {
    try {
      return Result.ok(of(id, content, senderId, sentAt));
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  }

  export function equals(a: Message, b: Message): boolean {
    return (
      a.id.value === b.id.value &&
      a.content === b.content &&
      a.senderId.value === b.senderId.value &&
      a.sentAt.getTime() === b.sentAt.getTime()
    );
  }

  export function is(value: unknown): value is Message {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<Message>;
    return candidate[MESSAGE_BRAND] === true;
  }

  export function toJSON(message: Message): MessageJson {
    return {
      id: { value: message.id.value },
      content: message.content,
      senderId: { value: message.senderId.value },
      sentAt: message.sentAt.toISOString(),
    };
  }

  export function fromJSON(json: unknown): Message {
    if (
      typeof json !== "object" ||
      json === null ||
      !("id" in json) ||
      !("content" in json) ||
      typeof json.content !== "string" ||
      !("senderId" in json) ||
      !("sentAt" in json) ||
      typeof json.sentAt !== "string"
    ) {
      throw new Error("Invalid Message JSON");
    }
    return of(
      convertJSONToMessageId(json.id),
      json.content,
      convertJSONToUserAccountId(json.senderId),
      new Date(json.sentAt),
    );
  }
}

export const convertJSONToMessage = Message.fromJSON;
