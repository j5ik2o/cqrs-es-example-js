import { TextDecoder } from "node:util";
import type { DynamoDBStreamEvent } from "aws-lambda";
import { convertJSONToGroupChatEvent } from "cqrs-es-example-js-command-domain";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

const decoder = new TextDecoder("utf-8");

/**
 * AWS adapter: decodes a DynamoDB Streams event (journal inserts) into one or
 * more provider-neutral `ReadModelUpdaterInput` values.
 */
function decodeDynamoDBStreamEvent(
  event: DynamoDBStreamEvent,
): ReadModelUpdaterInput[] {
  const inputs: ReadModelUpdaterInput[] = [];
  for (const record of event.Records) {
    // The journal is append-only; only INSERTs carry new domain events. Ignore
    // MODIFY/REMOVE so an item change is never replayed as a fresh event.
    if (record.eventName !== "INSERT") {
      continue;
    }
    const image = record.dynamodb?.NewImage;
    const rawPayload = image?.payload?.B;
    if (rawPayload === undefined) {
      throw new Error(
        `DynamoDB INSERT record is missing NewImage.payload.B (sequenceNumber=${String(
          record.dynamodb?.SequenceNumber ?? "",
        )})`,
      );
    }
    const groupChatEvent = convertJSONToGroupChatEvent(
      parsePayload(rawPayload),
    );
    const observedAt = approximateCreationToDate(
      record.dynamodb?.ApproximateCreationDateTime,
    );
    inputs.push({
      event: groupChatEvent,
      aggregateId: groupChatEvent.aggregateId.asString(),
      sequenceNumber: groupChatEvent.sequenceNumber,
      sourceProvider: "dynamodb",
      observedAt,
      position: record.dynamodb?.SequenceNumber,
    });
  }
  return inputs;
}

/**
 * AWS Lambda documents `ApproximateCreationDateTime` as epoch **seconds**, but
 * LocalStack and the dynamodb-local-rmu stream driver deliver epoch **milliseconds**.
 * Disambiguate by magnitude so the value never overflows into a garbage date.
 */
function approximateCreationToDate(value: number | undefined): Date {
  if (value === undefined) {
    return new Date();
  }
  // 1e12 ms ≈ year 2001; any realistic epoch-seconds value is below it.
  const millis = value < 1e12 ? value * 1000 : value;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parsePayload(rawPayload: string): unknown {
  try {
    // LocalStack: the B field carries a raw JSON string.
    return JSON.parse(rawPayload);
  } catch {
    // AWS Lambda: base64; dynamodb-local-rmu bridge: comma-separated byte string.
    const bytes = /^\d+(,\d+)*$/.test(rawPayload)
      ? new Uint8Array(rawPayload.split(",").map(Number))
      : new Uint8Array(Buffer.from(rawPayload, "base64"));
    return JSON.parse(decoder.decode(bytes));
  }
}

export { decodeDynamoDBStreamEvent };
