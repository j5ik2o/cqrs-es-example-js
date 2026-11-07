import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";

/**
 * Builds DynamoDB clients from the same environment variables the write and
 * read APIs use. When the endpoint variables are absent the SDK's default
 * credential chain and endpoint are used (Lambda in AWS).
 */
export function createDynamoDBClients(): {
  dynamodbClient: DynamoDBClient;
  dynamodbStreamsClient: DynamoDBStreamsClient;
} {
  const region = process.env.AWS_REGION;
  const endpoint = process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;

  if (region && endpoint && accessKeyId && secretAccessKey) {
    const credentials = { accessKeyId, secretAccessKey };
    return {
      dynamodbClient: new DynamoDBClient({
        region,
        endpoint,
        credentials,
      }),
      dynamodbStreamsClient: new DynamoDBStreamsClient({
        region,
        endpoint,
        credentials,
      }),
    };
  }
  return {
    dynamodbClient: new DynamoDBClient(),
    dynamodbStreamsClient: new DynamoDBStreamsClient(),
  };
}
