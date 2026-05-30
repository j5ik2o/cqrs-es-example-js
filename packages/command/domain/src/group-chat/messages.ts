import { Message, type MessageJson, convertJSONToMessage } from "./message";
import type { MessageId } from "./message-id";

const MESSAGES_BRAND: unique symbol = Symbol("Messages");

export type MessagesJson = {
  values: MessageJson[];
};

export type Messages = {
  values: readonly Message[];
  readonly [MESSAGES_BRAND]: true;
};

export namespace Messages {
  export function fromArray(values: readonly Message[]): Messages {
    return Object.freeze({
      [MESSAGES_BRAND]: true as const,
      values: Object.freeze([...values]),
    });
  }

  export function ofEmpty(): Messages {
    return fromArray([]);
  }

  export function ofSingle(message: Message): Messages {
    return fromArray([message]);
  }

  export function addMessage(messages: Messages, message: Message): Messages {
    const withoutTarget = messages.values.filter(
      (m) => m.id.value !== message.id.value,
    );
    return fromArray([...withoutTarget, message]);
  }

  export function removeMessageById(
    messages: Messages,
    messageId: MessageId,
  ): [Messages, Message] | undefined {
    const target = findById(messages, messageId);
    if (target === undefined) {
      return undefined;
    }
    const remaining = messages.values.filter(
      (m) => m.id.value !== messageId.value,
    );
    return [fromArray(remaining), target];
  }

  export function findById(
    messages: Messages,
    messageId: MessageId,
  ): Message | undefined {
    return messages.values.find((m) => m.id.value === messageId.value);
  }

  export function containsById(
    messages: Messages,
    messageId: MessageId,
  ): boolean {
    return findById(messages, messageId) !== undefined;
  }

  export function toArray(messages: Messages): Message[] {
    return [...messages.values];
  }

  export function size(messages: Messages): number {
    return messages.values.length;
  }

  export function equals(a: Messages, b: Messages): boolean {
    return (
      a.values.length === b.values.length &&
      a.values.every((message, index) =>
        Message.equals(message, b.values[index]),
      )
    );
  }

  export function toJSON(messages: Messages): MessagesJson {
    return { values: messages.values.map(Message.toJSON) };
  }

  export function fromJSON(json: unknown): Messages {
    if (
      typeof json !== "object" ||
      json === null ||
      !("values" in json) ||
      !Array.isArray(json.values)
    ) {
      throw new Error("Invalid Messages JSON");
    }
    return fromArray(json.values.map(convertJSONToMessage));
  }
}

export const convertJSONToMessages = Messages.fromJSON;
