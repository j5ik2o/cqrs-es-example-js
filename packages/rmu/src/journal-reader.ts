import { TextDecoder } from "node:util";
import {
  type AttributeValue,
  QueryCommand,
  type QueryCommandOutput,
} from "@aws-sdk/client-dynamodb";
import {
  type GroupChatEvent,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";

const decoder = new TextDecoder("utf-8");

/**
 * One event read from the journal table. The envelope metadata is separated
 * from the domain payload, matching the head item's `events` entries.
 */
export type JournalEvent = {
  aggregateId: string;
  seqNr: number;
  occurredAt: Date;
  manifest: string;
  payload: Uint8Array;
  event: GroupChatEvent;
};

/** The subset of DynamoDBClient used by the journal reader, so tests can fake it. */
export type DynamoDBQueryClient = {
  send(command: QueryCommand): Promise<QueryCommandOutput>;
};

/**
 * Fills a sequence-number gap detected in the head stream. The journal is read
 * with strong consistency so every event committed before the query started is
 * returned in ascending `seq_nr` order (DY-11).
 */
export type JournalReader = {
  readEvents(
    aggregateId: string,
    fromSeqNr: number,
    toSeqNr: number,
  ): Promise<JournalEvent[]>;
};

export namespace JournalReader {
  export function createDynamoDB(
    client: DynamoDBQueryClient,
    journalTableName: string,
  ): JournalReader {
    return Object.freeze({
      async readEvents(
        aggregateId: string,
        fromSeqNr: number,
        toSeqNr: number,
      ): Promise<JournalEvent[]> {
        if (fromSeqNr > toSeqNr) {
          return [];
        }
        const events: JournalEvent[] = [];
        let exclusiveStartKey: Record<string, AttributeValue> | undefined;
        for (;;) {
          const output = await client.send(
            new QueryCommand({
              TableName: journalTableName,
              ConsistentRead: true,
              ScanIndexForward: true,
              KeyConditionExpression:
                "aid = :aid AND seq_nr BETWEEN :fromSeqNr AND :toSeqNr",
              ExpressionAttributeValues: {
                ":aid": { S: aggregateId },
                ":fromSeqNr": { N: String(fromSeqNr) },
                ":toSeqNr": { N: String(toSeqNr) },
              },
              ExclusiveStartKey: exclusiveStartKey,
            }),
          );
          for (const item of output.Items ?? []) {
            events.push(journalEventFromItem(item));
          }
          exclusiveStartKey = output.LastEvaluatedKey;
          if (exclusiveStartKey === undefined) {
            return events;
          }
        }
      },
    });
  }
}

function journalEventFromItem(
  item: Record<string, AttributeValue>,
): JournalEvent {
  const aggregateId = item.aid?.S;
  if (aggregateId === undefined) {
    throw new Error("Journal item is missing aid string");
  }
  const seqNr = parseSeqNr(item.seq_nr?.N, aggregateId);
  const occurredAt = new Date(
    Number(
      parseOccurredAt(item.occurred_at?.N, aggregateId) / BigInt(1_000_000),
    ),
  );
  const manifest = item.manifest?.S ?? "";
  const payload = payloadBytes(item.payload, aggregateId);
  const json = parseJSONBytes(payload, aggregateId);
  return {
    aggregateId,
    seqNr,
    occurredAt,
    manifest,
    payload,
    event: convertJSONToGroupChatEvent(attachManifestType(json, manifest)),
  };
}

function attachManifestType(json: unknown, manifest: string): unknown {
  if (typeof json !== "object" || json === null) {
    return json;
  }
  if ("type" in json || "typeName" in json) {
    return json;
  }
  const typeName = manifest.split("@")[0];
  return typeName === "" ? json : { ...json, typeName };
}

function parseSeqNr(value: string | undefined, aggregateId: string): number {
  if (value === undefined) {
    throw new Error(`Journal item ${aggregateId} is missing seq_nr`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Journal item ${aggregateId} has invalid seq_nr: ${value}`);
  }
  return parsed;
}

function parseOccurredAt(
  value: string | undefined,
  aggregateId: string,
): bigint {
  if (value === undefined) {
    throw new Error(`Journal item ${aggregateId} is missing occurred_at`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new Error(
      `Journal item ${aggregateId} has invalid occurred_at: ${value}`,
    );
  }
}

function payloadBytes(
  value: AttributeValue | undefined,
  aggregateId: string,
): Uint8Array {
  if (value?.B !== undefined) {
    return value.B;
  }
  if (value?.S !== undefined) {
    return new TextEncoder().encode(value.S);
  }
  throw new Error(`Journal item ${aggregateId} is missing payload`);
}

function parseJSONBytes(payload: Uint8Array, aggregateId: string): unknown {
  try {
    return JSON.parse(decoder.decode(payload));
  } catch (error) {
    throw new Error(
      `Journal item ${aggregateId} payload is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export { journalEventFromItem };
