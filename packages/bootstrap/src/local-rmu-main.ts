import {ILogObj, Logger} from "tslog";
import {GroupChatDao, ReadModelUpdater} from "cqrs-es-example-js-rmu";
import {DescribeTableCommand, DynamoDBClient,} from "@aws-sdk/client-dynamodb";
import {
  _Record,
  AttributeValue as SDKStreamsAttributeValue,
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand, GetRecordsCommandOutput,
  GetShardIteratorCommand,
} from "@aws-sdk/client-dynamodb-streams";
import {PrismaClient} from "@prisma/client";
import {AttributeValue as LambdaAttributeValue, DynamoDBStreamEvent,} from "aws-lambda";

const logger: Logger<ILogObj> = new Logger();

function localRmuMain() {
  logger.info("Starting local read model updater");

  const apiHost =
    process.env.API_HOST !== undefined ? process.env.API_HOST : "localhost";
  const apiPort =
    process.env.API_PORT !== undefined ? parseInt(process.env.API_PORT) : 3000;

  const awsRegion = process.env.AWS_REGION;
  const awsDynamodbEndpointUrl = process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const awsDynamodbAccessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const awsDynamodbSecretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

  const streamJournalTableName =
    process.env.STREAM_JOURNAL_TABLE_NAME !== undefined
      ? process.env.STREAM_JOURNAL_TABLE_NAME
      : "journal";
  const streamMaxItemCount =
    process.env.STREAM_MAX_ITEM_COUNT !== undefined
      ? parseInt(process.env.STREAM_MAX_ITEM_COUNT)
      : 100;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  logger.info(`API_HOST: ${apiHost}`);
  logger.info(`API_PORT: ${apiPort}`);
  logger.info(`AWS_REGION: ${awsRegion}`);
  logger.info(`AWS_DYNAMODB_ENDPOINT_URL: ${awsDynamodbEndpointUrl}`);
  logger.info(`AWS_DYNAMODB_ACCESS_KEY_ID: ${awsDynamodbAccessKeyId}`);
  logger.info(`AWS_DYNAMODB_SECRET_ACCESS_KEY: ${awsDynamodbSecretAccessKey}`);
  logger.info(`STREAM_JOURNAL_TABLE_NAME: ${streamJournalTableName}`);
  logger.info(`STREAM_MAX_ITEM_COUNT: ${streamMaxItemCount}`);

  let dynamodbClient: DynamoDBClient;
  let dynamodbStreamsClient: DynamoDBStreamsClient;
  if (
    awsRegion &&
    awsDynamodbEndpointUrl &&
    awsDynamodbAccessKeyId &&
    awsDynamodbSecretAccessKey
  ) {
    dynamodbClient = new DynamoDBClient({
      region: awsRegion,
      endpoint: awsDynamodbEndpointUrl,
      credentials: {
        accessKeyId: awsDynamodbAccessKeyId,
        secretAccessKey: awsDynamodbSecretAccessKey,
      },
    });
    dynamodbStreamsClient = new DynamoDBStreamsClient({
      region: awsRegion,
      endpoint: awsDynamodbEndpointUrl,
      credentials: {
        accessKeyId: awsDynamodbAccessKeyId,
        secretAccessKey: awsDynamodbSecretAccessKey,
      },
    });
  } else {
    dynamodbClient = new DynamoDBClient();
    dynamodbStreamsClient = new DynamoDBStreamsClient();
  }

  const prisma = new PrismaClient();
  const dao = GroupChatDao.of(prisma);
  const readModelUpdater = ReadModelUpdater.of(dao);

  streamDriver(
    dynamodbClient,
    dynamodbStreamsClient,
    streamJournalTableName,
    streamMaxItemCount,
    readModelUpdater,
  )
    .catch((error) => {
      logger.error(error);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

async function streamDriver(
  dynamodbClient: DynamoDBClient,
  dynamodbStreamsClient: DynamoDBStreamsClient,
  streamJournalTableName: string,
  streamMaxItemCount: number,
  readModelUpdater: ReadModelUpdater,
) {
  const result = await dynamodbClient.send(
    new DescribeTableCommand({ TableName: streamJournalTableName }),
  );
  const streamArn = result.Table?.LatestStreamArn;
  if (!streamArn) {
    throw new Error("StreamArn is not set");
  }
  let lastEvaluatedShardId: string | undefined = undefined

  for (;;) {
    logger.info(`streamArn = ${streamArn}`);
    logger.info(`maxItemCount = ${streamMaxItemCount}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let req: any = { StreamArn: streamArn }
    if (lastEvaluatedShardId) {
      req = { ...req, ExclusiveStartShardId: lastEvaluatedShardId }
    }
    const describeStream = await dynamodbStreamsClient.send(
      new DescribeStreamCommand(req),
    );
    const shards = describeStream.StreamDescription?.Shards;
    if (!shards) {
      throw new Error("Shards is not set");
    }
    for (const shard of shards) {
      const getShardIterator = await dynamodbStreamsClient.send(
        new GetShardIteratorCommand({
          StreamArn: streamArn,
          ShardId: shard.ShardId,
          ShardIteratorType: "LATEST",
        }),
      );
      let shardIterator = getShardIterator.ShardIterator;
      if (!shardIterator) {
        throw new Error("ShardIterator is not set");
      }
      let processedRecordCount = 0;
      while (processedRecordCount < streamMaxItemCount) {
        const getRecords: GetRecordsCommandOutput = await dynamodbStreamsClient.send(
          new GetRecordsCommand({ ShardIterator: shardIterator }),
        );
        const records = getRecords.Records;
        if (!records) {
          throw new Error("Records is not set");
        }
        for (const record of records) {
          const keys = getKeys(record);
          const item = getItem(record);
            logger.info(`keys = ${JSON.stringify(keys)}`);
            logger.info(`item = ${JSON.stringify(item)}`);
          await readModelUpdater.updateReadModel(convertToEvent(record, keys, item, streamArn));
        }
        processedRecordCount += records.length;
        shardIterator = getRecords.NextShardIterator;
      }
    }
    if (describeStream.StreamDescription?.LastEvaluatedShardId === undefined) {
      break;
    }
    lastEvaluatedShardId = describeStream.StreamDescription?.LastEvaluatedShardId;
  }
}

function convertToEvent(record: _Record, keys: Record<string, LambdaAttributeValue>, item: Record<string, LambdaAttributeValue>, streamArn: string): DynamoDBStreamEvent {
  return {
    Records: [
      {
        awsRegion: record.awsRegion,
        dynamodb: {
          ApproximateCreationDateTime: record.dynamodb?.ApproximateCreationDateTime?.getTime(),
          Keys: keys,
          NewImage: item,
          SequenceNumber: record.dynamodb?.SequenceNumber,
          SizeBytes: record.dynamodb?.SizeBytes,
          StreamViewType: "NEW_IMAGE",
        },
        eventID: record.eventID,
        eventName: "INSERT",
        eventSource: record.eventSource,
        eventSourceARN: streamArn,
        eventVersion: record.eventVersion,
        userIdentity: {
          "type": "Service",
          "principalId": "dynamodb.amazonaws.com",
        },
      },
    ],
  };
}

function getItem(record: _Record): Record<string, LambdaAttributeValue> {
  const dynamodb = record.dynamodb;
  if (!dynamodb) {
    throw new Error("DynamoDB is not set");
  }
  const item = dynamodb.NewImage;
  if (!item) {
    throw new Error("NewImage is not set");
  }
  return convertAttributeRecordToMap(item);
}

function getKeys(record: _Record): Record<string, LambdaAttributeValue> {
  const dynamodb = record.dynamodb;
  if (!dynamodb) {
    throw new Error("DynamoDB is not set");
  }
  const keys = dynamodb.Keys;
  if (!keys) {
    throw new Error("Keys is not set");
  }
  return convertAttributeRecordToMap(keys);
}

function convertAttributeRecordToMap(
  record: Record<string, SDKStreamsAttributeValue>,
): Record<string, LambdaAttributeValue> {
  const result: Record<string, LambdaAttributeValue> = {};

  for (const key in record) {
    const sdkValue = record[key];
    // 各属性値を変換関数を通じてLambdaAttributeValueに変換
    result[key] = convertTo(sdkValue);
  }
  return result;
}

function convertTo(value: SDKStreamsAttributeValue): LambdaAttributeValue {
  if (value.S) {
    return { S: value.S };
  }
  if (value.N) {
    return { N: value.N };
  }
  if (value.B) {
    return { B: value.B.toString() };
  }
  if (value.BOOL) {
    return { BOOL: value.BOOL };
  }
  if (value.NULL) {
    return { NULL: value.NULL };
  }
  if (value.BS) {
    const array = value.BS;
    return { BS: array.map((b) => b.toString()) };
  }
  if (value.SS) {
    return { SS: value.SS };
  }
  if (value.NS) {
    return { NS: value.NS };
  }
  if (value.L) {
    const array = value.L;
    return { L: array.map(convertTo) };
  }
  if (value.M) {
    const map = value.M;
    const result: { [id: string]: LambdaAttributeValue } = {};
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        result[key] = convertTo(map[key]);
      }
    }
    return { M: result };
  }
  throw new Error("Unexpected attribute value");
}

export { localRmuMain };
