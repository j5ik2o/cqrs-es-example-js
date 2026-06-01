import type { DynamoDBStreamEvent } from "aws-lambda";
import { applyReadModel } from "./apply-read-model";
import { decodeDynamoDBStreamEvent } from "./dynamodb-adapter";
import type { GroupChatDao } from "./group-chat-dao";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";
import {
  type SpannerPubSubMessage,
  decodeSpannerPubSubMessage,
} from "./spanner-pubsub-adapter";

/**
 * Thin composition over the provider adapters and the shared application
 * service. Provider handlers (AWS Lambda, Functions Framework) construct one of
 * these and forward their native payloads here; all projection rules live in
 * the shared `applyReadModel` service.
 */
export type ReadModelUpdater = {
  /** AWS / DynamoDB Streams path (kept for the existing local + Lambda RMU). */
  updateFromDynamoDBStream(
    dynamodbStreamEvent: DynamoDBStreamEvent,
  ): Promise<void>;
  /** Spanner Change Streams / Pub/Sub path. */
  updateFromSpannerPubSub(
    spannerPubSubMessage: SpannerPubSubMessage,
  ): Promise<void>;
  /** Provider-neutral path. */
  apply(inputs: readonly ReadModelUpdaterInput[]): Promise<void>;
};

export namespace ReadModelUpdater {
  export function create(dao: GroupChatDao): ReadModelUpdater {
    async function apply(
      inputs: readonly ReadModelUpdaterInput[],
    ): Promise<void> {
      for (const input of inputs) {
        await applyReadModel(dao, input);
      }
    }
    return Object.freeze({
      apply,
      updateFromDynamoDBStream(
        dynamodbStreamEvent: DynamoDBStreamEvent,
      ): Promise<void> {
        return apply(decodeDynamoDBStreamEvent(dynamodbStreamEvent));
      },
      updateFromSpannerPubSub(
        spannerPubSubMessage: SpannerPubSubMessage,
      ): Promise<void> {
        return apply(decodeSpannerPubSubMessage(spannerPubSubMessage));
      },
    });
  }
}
