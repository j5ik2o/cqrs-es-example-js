import type {
  AttributeValue,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { type DynamoDBScanClient, scanHeadTable } from "./head-scanner";

class FakeScanClient implements DynamoDBScanClient {
  readonly commands: ScanCommand[] = [];

  constructor(private readonly pages: ScanCommandOutput[]) {}

  async send(command: ScanCommand): Promise<ScanCommandOutput> {
    this.commands.push(command);
    const page = this.pages.shift();
    if (page === undefined) {
      throw new Error("unexpected ScanCommand");
    }
    return page;
  }
}

function page(
  items: readonly Record<string, AttributeValue>[],
  lastEvaluatedKey?: Record<string, AttributeValue>,
): ScanCommandOutput {
  return {
    $metadata: {},
    Items: [...items],
    LastEvaluatedKey: lastEvaluatedKey,
  };
}

describe("scanHeadTable", () => {
  test("follows LastEvaluatedKey across pages with strong consistency", async () => {
    const client = new FakeScanClient([
      page([{ aid: { S: "GroupChat-1" }, seq_nr: { N: "1" } }], {
        aid: { S: "GroupChat-1" },
      }),
      page([
        { aid: { S: "GroupChat-2" }, seq_nr: { N: "4" } },
        { aid: { S: "__config__" }, store_id: { S: "x" } },
      ]),
    ]);

    const items = await scanHeadTable(client, "head");

    expect(items.map((item) => item.aid?.S)).toEqual([
      "GroupChat-1",
      "GroupChat-2",
      "__config__",
    ]);
    expect(client.commands).toHaveLength(2);
    expect(client.commands[0].input).toMatchObject({
      TableName: "head",
      ConsistentRead: true,
    });
    expect(client.commands[0].input.ExclusiveStartKey).toBeUndefined();
    expect(client.commands[1].input.ExclusiveStartKey).toEqual({
      aid: { S: "GroupChat-1" },
    });
  });

  test("normalizes binary payloads to base64 for the head adapter", async () => {
    const payload = Buffer.from('{"typeName":"GroupChatCreated"}', "utf-8");
    const client = new FakeScanClient([
      page([
        {
          aid: { S: "GroupChat-1" },
          events: {
            L: [
              {
                M: {
                  payload: { B: payload },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const [item] = await scanHeadTable(client, "head");

    const binary = item.events?.L?.[0]?.M?.payload?.B;
    expect(binary).toEqual(payload.toString("base64"));
  });
});
