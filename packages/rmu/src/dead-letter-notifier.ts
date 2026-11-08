import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { DeadLetterRecord } from "./dead-letter-store";

/**
 * Identity-only notification for a persisted recovery task. The event body is
 * never included: the consumer re-reads it from the journal through the
 * `recoverReadModel` task, so a queue redrive cannot replay stale or unverified
 * payloads.
 */
export type DeadLetterNotification = {
  /** Stable task identity, so a consumer can deduplicate redelivery. */
  deadLetterId: string;
  storeId: string;
  projectionName: string;
  projectionVersion: string;
  aggregateId: string;
  seqNr: number;
  failureType: string;
  attempts: number;
  occurredAt?: string;
  manifest?: string;
  recordIdentifier?: string;
};

export type DeadLetterNotifier = {
  notify(record: DeadLetterRecord): Promise<void>;
};

/** The subset of `SQSClient` used here, so tests can fake the transport. */
export type SqsSendClient = {
  send(command: SendMessageCommand): Promise<unknown>;
};

export type SqsNotifierOptions = {
  /** Required only for a FIFO queue. */
  messageGroupId?: string;
  /** Defaults to the stable task identity, which makes redelivery safe. */
  messageDeduplicationId?: (record: DeadLetterRecord) => string;
};

export function deadLetterNotification(
  record: DeadLetterRecord,
): DeadLetterNotification {
  return {
    deadLetterId: deadLetterId(record),
    storeId: record.storeId,
    projectionName: record.projectionName,
    projectionVersion: record.projectionVersion,
    aggregateId: record.aggregateId,
    seqNr: record.seqNr,
    failureType: record.failureType,
    attempts: record.attempts,
    occurredAt: record.occurredAt?.toISOString(),
    manifest: record.manifest,
    recordIdentifier: record.recordIdentifier,
  };
}

export function deadLetterId(record: DeadLetterRecord): string {
  return `${record.projectionName}:${record.aggregateId}:${record.seqNr}`;
}

export namespace DeadLetterNotifier {
  export function createSqs(
    client: SqsSendClient,
    queueUrl: string,
    options: SqsNotifierOptions = {},
  ): DeadLetterNotifier {
    return Object.freeze({
      async notify(record: DeadLetterRecord): Promise<void> {
        const body = JSON.stringify(deadLetterNotification(record));
        await client.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: body,
            MessageAttributes: {
              projection_name: stringAttribute(record.projectionName),
              failure_type: stringAttribute(record.failureType),
              aggregate_id: stringAttribute(record.aggregateId),
              seq_nr: {
                DataType: "Number",
                StringValue: String(record.seqNr),
              },
            },
            ...fifoFields(record, options),
          }),
        );
      },
    });
  }
}

function stringAttribute(value: string) {
  return { DataType: "String", StringValue: value };
}

/**
 * `MessageGroupId` and `MessageDeduplicationId` are rejected by standard
 * queues, so they are only sent when configured.
 */
function fifoFields(
  record: DeadLetterRecord,
  options: SqsNotifierOptions,
): { MessageGroupId?: string; MessageDeduplicationId?: string } {
  if (options.messageGroupId === undefined) {
    return {};
  }
  return {
    MessageGroupId: options.messageGroupId,
    MessageDeduplicationId:
      options.messageDeduplicationId?.(record) ?? deadLetterId(record),
  };
}
