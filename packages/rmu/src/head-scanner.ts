import {
  ScanCommand,
  type ScanCommandOutput,
  type AttributeValue as SdkAttributeValue,
} from "@aws-sdk/client-dynamodb";
import type { AttributeValue as LambdaAttributeValue } from "aws-lambda";

/** The subset of DynamoDBClient used by the head scanner, so tests can fake it. */
export type DynamoDBScanClient = {
  send(command: ScanCommand): Promise<ScanCommandOutput>;
};

/**
 * Reads every head item with strong consistency, following `LastEvaluatedKey`
 * to the end (DY-15). A consistent scan is the point: an eventually consistent
 * one could miss an aggregate that changed while the read model was stalled.
 * The caller filters `__config__` and foreign types after decoding.
 */
async function scanHeadTable(
  client: DynamoDBScanClient,
  tableName: string,
): Promise<Record<string, LambdaAttributeValue>[]> {
  const items: Record<string, LambdaAttributeValue>[] = [];
  let exclusiveStartKey: Record<string, SdkAttributeValue> | undefined;
  for (;;) {
    const output = await client.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of output.Items ?? []) {
      items.push(convertItem(item));
    }
    exclusiveStartKey = output.LastEvaluatedKey;
    if (exclusiveStartKey === undefined) {
      return items;
    }
  }
}

function convertItem(
  item: Record<string, SdkAttributeValue>,
): Record<string, LambdaAttributeValue> {
  const result: Record<string, LambdaAttributeValue> = {};
  for (const [key, value] of Object.entries(item)) {
    result[key] = convertValue(value);
  }
  return result;
}

/**
 * Converts an SDK attribute value into the Lambda-shaped value the head adapter
 * consumes. Binary payloads are normalized to base64, which the adapter's
 * `parsePayloadBytes` already understands.
 */
function convertValue(value: SdkAttributeValue): LambdaAttributeValue {
  if (value.S !== undefined) {
    return { S: value.S };
  }
  if (value.N !== undefined) {
    return { N: value.N };
  }
  if (value.B !== undefined) {
    return { B: Buffer.from(value.B).toString("base64") };
  }
  if (value.BOOL !== undefined) {
    return { BOOL: value.BOOL };
  }
  if (value.NULL !== undefined) {
    return { NULL: value.NULL };
  }
  if (value.SS !== undefined) {
    return { SS: value.SS };
  }
  if (value.NS !== undefined) {
    return { NS: value.NS };
  }
  if (value.BS !== undefined) {
    return {
      BS: value.BS.map((binary) => Buffer.from(binary).toString("base64")),
    };
  }
  if (value.L !== undefined) {
    return { L: value.L.map(convertValue) };
  }
  if (value.M !== undefined) {
    return { M: convertItem(value.M) };
  }
  throw new Error("Unsupported DynamoDB attribute value in head scan");
}

export { scanHeadTable };
