import {
  CreateTableCommand,
  type CreateTableCommandInput,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import type { StartedTestContainer } from "testcontainers";

function createDynamoDBClient(startedContainer: StartedTestContainer) {
  const port = startedContainer.getMappedPort(4566);
  return new DynamoDBClient({
    region: "us-west-1",
    endpoint: `http://localhost:${port}`,
    credentials: {
      accessKeyId: "x",
      secretAccessKey: "x",
    },
  });
}

// ESA v5 DynamoDB layout: the journal is keyed by aid + seq_nr and has no GSI;
// the snapshot uses aid + skey with a sparse (aid, active_history_seq_nr) GSI;
// the head is keyed by aid and is the change feed.
async function createJournalTable(
  dynamodbClient: DynamoDBClient,
  tableName: string,
) {
  const request: CreateTableCommandInput = {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "aid", AttributeType: "S" },
      { AttributeName: "seq_nr", AttributeType: "N" },
    ],
    KeySchema: [
      { AttributeName: "aid", KeyType: "HASH" },
      { AttributeName: "seq_nr", KeyType: "RANGE" },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10,
      WriteCapacityUnits: 5,
    },
  };

  await createTable(dynamodbClient, request);
}

async function createSnapshotTable(
  dynamodbClient: DynamoDBClient,
  tableName: string,
  historyIndexName: string,
) {
  const request: CreateTableCommandInput = {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "aid", AttributeType: "S" },
      { AttributeName: "skey", AttributeType: "N" },
      { AttributeName: "active_history_seq_nr", AttributeType: "N" },
    ],
    KeySchema: [
      { AttributeName: "aid", KeyType: "HASH" },
      { AttributeName: "skey", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: historyIndexName,
        KeySchema: [
          { AttributeName: "aid", KeyType: "HASH" },
          { AttributeName: "active_history_seq_nr", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "KEYS_ONLY" },
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 5,
        },
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10,
      WriteCapacityUnits: 5,
    },
  };

  await createTable(dynamodbClient, request);
}

async function createHeadTable(
  dynamodbClient: DynamoDBClient,
  tableName: string,
) {
  const request: CreateTableCommandInput = {
    TableName: tableName,
    AttributeDefinitions: [{ AttributeName: "aid", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "aid", KeyType: "HASH" }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10,
      WriteCapacityUnits: 5,
    },
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_IMAGE",
    },
  };

  await createTable(dynamodbClient, request);
}

async function createTable(
  dynamodbClient: DynamoDBClient,
  request: CreateTableCommandInput,
) {
  await dynamodbClient.send(new CreateTableCommand(request));
  const deadline = Date.now() + 30_000;
  for (;;) {
    const described = await dynamodbClient.send(
      new DescribeTableCommand({ TableName: request.TableName }),
    );
    if (described.Table?.TableStatus === "ACTIVE") {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `DynamoDB table ${String(request.TableName)} did not become ACTIVE`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export {
  createDynamoDBClient,
  createHeadTable,
  createJournalTable,
  createSnapshotTable,
};
