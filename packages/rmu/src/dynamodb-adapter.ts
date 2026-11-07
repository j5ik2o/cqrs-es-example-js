import { TextDecoder } from "node:util";
import type { DynamoDBStreamEvent } from "aws-lambda";
import { convertJSONToGroupChatEvent } from "cqrs-es-example-js-command-domain";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

const decoder = new TextDecoder("utf-8");

const CONFIG_AGGREGATE_ID = "__config__";

/**
 * AWS adapter: decodes a DynamoDB Streams event (journal inserts) into one or
 * more provider-neutral `ReadModelUpdaterInput` values.
 *
 * ESA v5 keeps the aggregate id, `seq_nr`, `occurred_at` and manifest in the
 * journal item, and writes only domain data to `payload`. The adapter therefore
 * reads metadata from the item and passes the pure payload to the domain
 * decoder. Journal Streams stay enabled until the RMU moves to the head Streams
 * (#828).
 */
function decodeDynamoDBStreamEvent(
  dynamodbStreamEvent: DynamoDBStreamEvent,
): ReadModelUpdaterInput[] {
  const inputs: ReadModelUpdaterInput[] = [];
  for (const dynamodbStreamRecord of dynamodbStreamEvent.Records) {
    // The journal is append-only; only INSERTs carry new domain events. Ignore
    // MODIFY/REMOVE so an item change is never replayed as a fresh event.
    if (dynamodbStreamRecord.eventName !== "INSERT") {
      continue;
    }
    const dynamodbStreamImage = dynamodbStreamRecord.dynamodb?.NewImage;
    const aggregateId = dynamodbStreamImage?.aid?.S;
    // The v5 store writes its configuration item into the journal table too.
    // Journal Streams stay enabled until the RMU moves to the head Streams
    // (#828), so this reserved item must never be decoded as a domain event.
    if (aggregateId === CONFIG_AGGREGATE_ID) {
      continue;
    }
    const rawPayload = dynamodbStreamImage?.payload?.B;
    if (rawPayload === undefined) {
      throw new Error(
        `DynamoDB INSERT record is missing NewImage.payload.B (sequenceNumber=${String(
          dynamodbStreamRecord.dynamodb?.SequenceNumber ?? "",
        )})`,
      );
    }
    if (aggregateId === undefined) {
      throw new Error("DynamoDB INSERT record is missing NewImage.aid.S");
    }
    const sequenceNumber = parseNumber(dynamodbStreamImage?.seq_nr?.N);
    const manifest = dynamodbStreamImage?.manifest?.S ?? "";
    const groupChatEvent = convertJSONToGroupChatEvent(
      attachManifestType(parseDynamoDBStreamPayload(rawPayload), manifest),
    );
    const observedAt = parseDynamoDBApproximateCreationDate(
      dynamodbStreamRecord.dynamodb?.ApproximateCreationDateTime,
    );
    inputs.push({
      event: groupChatEvent,
      aggregateId,
      sequenceNumber,
      sourceProvider: "dynamodb",
      observedAt,
      occurredAt: parseOccurredAt(dynamodbStreamImage?.occurred_at?.N),
      position: dynamodbStreamRecord.dynamodb?.SequenceNumber,
    });
  }
  return inputs;
}

/**
 * AWS Lambda documents `ApproximateCreationDateTime` as epoch **seconds**, but
 * LocalStack and the dynamodb-local-rmu stream driver deliver epoch **milliseconds**.
 * Disambiguate by magnitude so the value never overflows into a garbage date.
 */
function parseDynamoDBApproximateCreationDate(value: number | undefined): Date {
  if (value === undefined) {
    return new Date();
  }
  // 1e12 ms ≈ year 2001; any realistic epoch-seconds value is below it.
  const millis = value < 1e12 ? value * 1000 : value;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseNumber(value: string | undefined): number {
  if (value === undefined) {
    throw new Error("DynamoDB journal record is missing NewImage.seq_nr.N");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`DynamoDB journal record has an invalid seq_nr: ${value}`);
  }
  return parsed;
}

/** The journal stores `occurred_at` as Unix epoch nanoseconds (D-3). */
function parseOccurredAt(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const millis = Number(BigInt(value) / BigInt(1_000_000));
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
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

function parseDynamoDBStreamPayload(rawPayload: string): unknown {
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
