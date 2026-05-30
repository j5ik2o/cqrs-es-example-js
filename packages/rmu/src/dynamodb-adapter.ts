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
    const image = record.dynamodb?.NewImage;
    const rawPayload = image?.payload?.B;
    if (rawPayload === undefined) {
      continue;
    }
    const groupChatEvent = convertJSONToGroupChatEvent(
      parsePayload(rawPayload),
    );
    const observedAt =
      record.dynamodb?.ApproximateCreationDateTime !== undefined
        ? new Date(record.dynamodb.ApproximateCreationDateTime * 1000)
        : new Date();
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

function parsePayload(rawPayload: string): unknown {
  try {
    // LocalStack: the B field carries a raw JSON string.
    return JSON.parse(rawPayload);
  } catch {
    // AWS Lambda: base64; local RMU bridge: comma-separated byte string.
    const bytes = /^\d+(,\d+)*$/.test(rawPayload)
      ? new Uint8Array(rawPayload.split(",").map(Number))
      : new Uint8Array(Buffer.from(rawPayload, "base64"));
    return JSON.parse(decoder.decode(bytes));
  }
}

export { decodeDynamoDBStreamEvent };
