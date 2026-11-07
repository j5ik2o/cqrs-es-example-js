import { SQSClient, type SQSClientConfig } from "@aws-sdk/client-sqs";
import { DeadLetterNotifier } from "cqrs-es-example-js-rmu";
import type { RmuRuntimeConfig } from "./rmu-config";

/**
 * Builds the SQS notifier when `RMU_DEAD_LETTER_QUEUE_URL` is set. Notifications
 * carry only the recovery-task identity; the `recoverReadModel` task re-reads
 * the event from the journal, so the queue never becomes a second copy of the
 * event store.
 */
export function createDeadLetterNotifier(
  config: RmuRuntimeConfig,
): DeadLetterNotifier | undefined {
  if (config.deadLetterQueueUrl === undefined) {
    return undefined;
  }
  return DeadLetterNotifier.createSqs(
    new SQSClient(sqsClientConfig(config)),
    config.deadLetterQueueUrl,
    { messageGroupId: config.deadLetterMessageGroupId },
  );
}

/**
 * LocalStack serves SQS on the same endpoint as DynamoDB, so the DynamoDB
 * endpoint is a fallback. In AWS both endpoint variables are absent and the
 * SDK's default credential chain and regional endpoint apply.
 */
function sqsClientConfig(config: RmuRuntimeConfig): SQSClientConfig {
  const endpoint =
    config.sqsEndpointUrl ?? process.env.AWS_DYNAMODB_ENDPOINT_URL;
  const accessKeyId = process.env.AWS_DYNAMODB_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_DYNAMODB_SECRET_ACCESS_KEY;
  return {
    ...(config.sqsRegion === undefined ? {} : { region: config.sqsRegion }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(accessKeyId === undefined || secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId, secretAccessKey } }),
  };
}
