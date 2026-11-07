import type { DeadLetterStore } from "./dead-letter-store";
import type { DeadLetterRecovery } from "./recovery";

/**
 * The identity published by `DeadLetterNotifier`. A notification is only a
 * trigger: the consumer re-reads the durable row and the recovery task re-reads
 * the event body from the journal, so a stale or forged message cannot replay
 * anything the store does not already hold.
 */
export type DeadLetterMessage = {
  projectionName: string;
  aggregateId: string;
  seqNr: number;
};

export type DeadLetterConsumeOutcome =
  | { status: "recovered" }
  /** The row is gone: already recovered, or the notification was stale. */
  | { status: "ignored"; reason: "missing" }
  | { status: "invalid"; reason: string }
  /** Recovery failed; the caller should let the queue redeliver the message. */
  | { status: "failed"; error: unknown };

export type DeadLetterConsumer = {
  consume(body: string): Promise<DeadLetterConsumeOutcome>;
};

export namespace DeadLetterConsumer {
  export function create(
    recovery: DeadLetterRecovery,
    deadLetters: DeadLetterStore,
  ): DeadLetterConsumer {
    return Object.freeze({
      async consume(body: string): Promise<DeadLetterConsumeOutcome> {
        const parsed = parseMessage(body);
        if (!parsed.ok) {
          return { status: "invalid", reason: parsed.reason };
        }
        const record = await deadLetters.find(
          parsed.message.projectionName,
          parsed.message.aggregateId,
          parsed.message.seqNr,
        );
        if (record === undefined) {
          return { status: "ignored", reason: "missing" };
        }
        try {
          await recovery.recover(record);
          return { status: "recovered" };
        } catch (error) {
          return { status: "failed", error };
        }
      },
    });
  }
}

type ParsedMessage =
  | { ok: true; message: DeadLetterMessage }
  | { ok: false; reason: string };

function parseMessage(body: string): ParsedMessage {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      reason: `message body is not JSON: ${errorMessage(error)}`,
    };
  }
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "message body is not an object" };
  }
  const message = value as Record<string, unknown>;
  if (
    typeof message.projectionName !== "string" ||
    message.projectionName === ""
  ) {
    return { ok: false, reason: "message is missing projectionName" };
  }
  if (typeof message.aggregateId !== "string" || message.aggregateId === "") {
    return { ok: false, reason: "message is missing aggregateId" };
  }
  if (
    typeof message.seqNr !== "number" ||
    !Number.isSafeInteger(message.seqNr) ||
    message.seqNr < 1
  ) {
    return {
      ok: false,
      reason: "message seqNr is not a positive safe integer",
    };
  }
  return {
    ok: true,
    message: {
      projectionName: message.projectionName,
      aggregateId: message.aggregateId,
      seqNr: message.seqNr,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
