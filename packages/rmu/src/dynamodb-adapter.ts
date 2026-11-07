import { TextDecoder } from "node:util";
import type { AttributeValue, DynamoDBStreamEvent } from "aws-lambda";
import { convertJSONToGroupChatEvent } from "cqrs-es-example-js-command-domain";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

const decoder = new TextDecoder("utf-8");

const CONFIG_AGGREGATE_ID = "__config__";
const GROUP_CHAT_TYPE_NAME = "GroupChat";

type HeadEvent = {
  seqNr: number;
  occurredAt: Date;
  manifest: string;
  payload: Uint8Array;
};

/**
 * AWS adapter: decodes a DynamoDB Streams event from the **head** table into
 * provider-neutral `ReadModelUpdaterInput` values.
 *
 * INSERT and MODIFY records both carry the events written by one transaction
 * (head.events). A REMOVE never happens because the event store does not delete
 * heads; skipping it keeps the adapter tolerant of stray records. `__config__`
 * is the store's configuration item and is not an aggregate.
 */
function decodeHeadStreamEvent(
  dynamodbStreamEvent: DynamoDBStreamEvent,
): ReadModelUpdaterInput[] {
  const inputs: ReadModelUpdaterInput[] = [];
  for (const record of dynamodbStreamEvent.Records) {
    if (record.eventName === "REMOVE") {
      continue;
    }
    if (record.eventName !== "INSERT" && record.eventName !== "MODIFY") {
      throw new Error(
        `Unexpected DynamoDB stream event name: ${String(record.eventName)}`,
      );
    }
    const image = record.dynamodb?.NewImage;
    if (image === undefined) {
      throw new Error("Head stream record is missing NewImage");
    }
    const aggregateId = requireString(image, "aid", "head image");
    if (aggregateId === CONFIG_AGGREGATE_ID) {
      continue;
    }
    if (!isGroupChatHead(image, aggregateId)) {
      continue;
    }
    const headEvents = parseHeadEvents(image);
    const observedAt = parseDynamoDBApproximateCreationDate(
      record.dynamodb?.ApproximateCreationDateTime,
    );
    for (const headEvent of headEvents) {
      inputs.push({
        event: decodePayload(headEvent),
        aggregateId,
        sequenceNumber: headEvent.seqNr,
        sourceProvider: "dynamodb",
        observedAt,
        occurredAt: headEvent.occurredAt,
        position: `${String(record.dynamodb?.SequenceNumber ?? "")}:${headEvent.seqNr}`,
      });
    }
  }
  return inputs;
}

function isGroupChatHead(
  image: Record<string, AttributeValue>,
  aggregateId: string,
): boolean {
  // The aid prefix is the authoritative type discriminator: the adapter must
  // never project another aggregate type into the GroupChat read model, even
  // if a malformed record carries a misleading type_name.
  if (!aggregateId.startsWith(`${GROUP_CHAT_TYPE_NAME}-`)) {
    return false;
  }
  const typeName = image.type_name?.S;
  return typeName === undefined || typeName === GROUP_CHAT_TYPE_NAME;
}

function parseHeadEvents(image: Record<string, AttributeValue>): HeadEvent[] {
  const list = image.events?.L;
  if (list === undefined) {
    throw new Error("Head stream record is missing NewImage.events");
  }
  const events = list.map((item, index) => {
    const fields = item.M;
    if (fields === undefined) {
      throw new Error(`Head event at index ${index} is not a map`);
    }
    return {
      seqNr: parseNumber(fields.seq_nr?.N, `events[${index}].seq_nr`),
      occurredAt: new Date(
        Number(
          parseBigInt(fields.occurred_at?.N, `events[${index}].occurred_at`) /
            BigInt(1_000_000),
        ),
      ),
      manifest: requireString(fields, "manifest", `head event ${index}`),
      payload: requireBinary(fields, "payload", `head event ${index}`),
    };
  });
  // The head item's events are already in write order, but sorting makes the
  // projection independent of the provider's list order.
  return events.sort((a, b) => a.seqNr - b.seqNr);
}

function decodePayload(headEvent: HeadEvent) {
  const json = parseJSONBytes(headEvent.payload);
  return convertJSONToGroupChatEvent(
    attachManifestType(json, headEvent.manifest),
  );
}

/**
 * A v5 payload should carry only the domain value. When the domain serializer
 * omits the type discriminator, the manifest (`<type>@<version>` or `<type>`)
 * supplies it so the same decoder serves both envelope shapes.
 */
function attachManifestType(json: unknown, manifest: string): unknown {
  if (typeof json !== "object" || json === null) {
    return json;
  }
  if ("type" in json || "typeName" in json) {
    return json;
  }
  const typeName = manifest.split("@")[0];
  if (typeName === "") {
    return json;
  }
  return { ...json, typeName };
}

function requireString(
  attributes: Record<string, AttributeValue>,
  name: string,
  context: string,
): string {
  const value = attributes[name]?.S;
  if (value === undefined) {
    throw new Error(`${context} is missing ${name} string`);
  }
  return value;
}

function requireBinary(
  attributes: Record<string, AttributeValue>,
  name: string,
  context: string,
): Uint8Array {
  const value = attributes[name]?.B;
  if (value === undefined) {
    throw new Error(`${context} is missing ${name} binary`);
  }
  return parsePayloadBytes(value);
}

function parseNumber(value: string | undefined, context: string): number {
  if (value === undefined) {
    throw new Error(`${context} is missing`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${context} is not a non-negative safe integer: ${value}`);
  }
  return parsed;
}

function parseBigInt(value: string | undefined, context: string): bigint {
  if (value === undefined) {
    throw new Error(`${context} is missing`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${context} is not an integer: ${value}`);
  }
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

function parsePayloadBytes(rawPayload: string): Uint8Array {
  // LocalStack: the B field carries a raw JSON string.
  try {
    JSON.parse(rawPayload);
    return new TextEncoder().encode(rawPayload);
  } catch {
    // AWS Lambda: base64; dynamodb-local-rmu bridge: comma-separated byte string.
    return /^\d+(,\d+)*$/.test(rawPayload)
      ? new Uint8Array(rawPayload.split(",").map(Number))
      : new Uint8Array(Buffer.from(rawPayload, "base64"));
  }
}

function parseJSONBytes(payload: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(payload));
  } catch (error) {
    throw new Error(
      `Head event payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export { decodeHeadStreamEvent };
