import * as Infrastructure from "cqrs-es-example-js-infrastructure";
import { Result } from "event-store-adapter-js/dist/result";
import * as U from "ulidx";

const MESSAGE_ID_BRAND: unique symbol = Symbol("MessageId");

export type MessageIdJson = {
  value: string;
};

export type MessageId = {
  value: string;
  asString: () => string;
  readonly [MESSAGE_ID_BRAND]: true;
};

export namespace MessageId {
  export function of(value: string): MessageId {
    if (!U.isValid(value)) {
      throw new Error("Invalid message id");
    }
    return Object.freeze({
      [MESSAGE_ID_BRAND]: true as const,
      value,
      asString: () => value,
    });
  }

  export function generate(): MessageId {
    return of(Infrastructure.generateULID());
  }

  export function validate(value: string): Result<MessageId, string> {
    try {
      return Result.ok(of(value));
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  }

  export function equals(a: MessageId, b: MessageId): boolean {
    return a.value === b.value;
  }

  export function is(value: unknown): value is MessageId {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Partial<MessageId>;
    return (
      candidate[MESSAGE_ID_BRAND] === true &&
      typeof candidate.value === "string"
    );
  }

  export function toJSON(value: MessageId): MessageIdJson {
    return { value: value.value };
  }

  export function fromJSON(json: unknown): MessageId {
    if (
      typeof json !== "object" ||
      json === null ||
      !("value" in json) ||
      typeof json.value !== "string"
    ) {
      throw new Error("Invalid MessageId JSON");
    }
    return of(json.value);
  }
}

export const convertJSONToMessageId = MessageId.fromJSON;
