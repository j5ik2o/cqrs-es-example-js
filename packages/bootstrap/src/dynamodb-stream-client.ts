import type {
  _Record as SdkStreamRecord,
  AttributeValue as SdkStreamsAttributeValue,
} from "@aws-sdk/client-dynamodb-streams";
import {
  DescribeStreamCommand,
  type DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import type { AttributeValue as LambdaAttributeValue } from "aws-lambda";
import type {
  ShardIteratorPosition,
  StreamClient,
  StreamRecordDescriptor,
  StreamShardDescriptor,
} from "cqrs-es-example-js-rmu";

/**
 * Adapts the AWS SDK's DynamoDB Streams client to the provider-neutral
 * `StreamClient` the recovery processor consumes. Attribute values are
 * converted to the Lambda shape because the head adapter already understands
 * that encoding.
 */
export function createDynamoDBStreamClient(
  client: DynamoDBStreamsClient,
  streamArn: string,
): StreamClient {
  return Object.freeze({
    async listShards(): Promise<StreamShardDescriptor[]> {
      const shards: StreamShardDescriptor[] = [];
      let exclusiveStartShardId: string | undefined;
      for (;;) {
        const output = await client.send(
          new DescribeStreamCommand({
            StreamArn: streamArn,
            ExclusiveStartShardId: exclusiveStartShardId,
          }),
        );
        for (const shard of output.StreamDescription?.Shards ?? []) {
          if (shard.ShardId !== undefined) {
            shards.push({ shardId: shard.ShardId });
          }
        }
        exclusiveStartShardId = output.StreamDescription?.LastEvaluatedShardId;
        if (exclusiveStartShardId === undefined) {
          return shards;
        }
      }
    },

    async getShardIterator(
      shardId: string,
      position: ShardIteratorPosition,
    ): Promise<string> {
      const output = await client.send(
        new GetShardIteratorCommand({
          StreamArn: streamArn,
          ShardId: shardId,
          ShardIteratorType:
            position.type === "trim-horizon"
              ? "TRIM_HORIZON"
              : "AFTER_SEQUENCE_NUMBER",
          SequenceNumber:
            position.type === "after-sequence-number"
              ? position.sequenceNumber
              : undefined,
        }),
      );
      if (output.ShardIterator === undefined) {
        throw new Error("ShardIterator is not set");
      }
      return output.ShardIterator;
    },

    async getRecords(iterator: string, limit: number) {
      const output = await client.send(
        new GetRecordsCommand({
          ShardIterator: iterator,
          Limit: limit,
        }),
      );
      const records = (output.Records ?? []).map(toDescriptor);
      return {
        records,
        nextIterator: output.NextShardIterator,
      };
    },
  });
}

function toDescriptor(record: SdkStreamRecord): StreamRecordDescriptor {
  const dynamodb = record.dynamodb;
  if (dynamodb === undefined) {
    throw new Error("Stream record is missing dynamodb");
  }
  const sequenceNumber = dynamodb.SequenceNumber ?? record.eventID;
  if (sequenceNumber === undefined) {
    throw new Error("Stream record is missing SequenceNumber");
  }
  return {
    eventName:
      record.eventName === "MODIFY"
        ? "MODIFY"
        : record.eventName === "REMOVE"
          ? "REMOVE"
          : "INSERT",
    sequenceNumber,
    newImage:
      dynamodb.NewImage === undefined
        ? undefined
        : convertItem(dynamodb.NewImage),
    approximateCreationDateTime:
      dynamodb.ApproximateCreationDateTime?.getTime(),
  };
}

function convertItem(
  item: Record<string, SdkStreamsAttributeValue>,
): Record<string, LambdaAttributeValue> {
  const result: Record<string, LambdaAttributeValue> = {};
  for (const [key, value] of Object.entries(item)) {
    result[key] = convertValue(value);
  }
  return result;
}

function convertValue(value: SdkStreamsAttributeValue): LambdaAttributeValue {
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
  if (value.BS !== undefined) {
    return {
      BS: value.BS.map((binary) => Buffer.from(binary).toString("base64")),
    };
  }
  if (value.SS !== undefined) {
    return { SS: value.SS };
  }
  if (value.NS !== undefined) {
    return { NS: value.NS };
  }
  if (value.L !== undefined) {
    return { L: value.L.map(convertValue) };
  }
  if (value.M !== undefined) {
    return { M: convertItem(value.M) };
  }
  throw new Error("Unexpected Streams attribute value");
}
