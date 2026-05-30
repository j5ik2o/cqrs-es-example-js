import type { DynamoDBStreamEvent } from "aws-lambda";
import { applyReadModel } from "./apply-read-model";
import { decodeDynamoDBStreamEvent } from "./dynamodb-adapter";
import type { GroupChatDao } from "./group-chat-dao";
import { type PubSubMessage, decodePubSubMessage } from "./pubsub-adapter";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

/**
 * Thin composition over the provider adapters and the shared application
 * service. Provider handlers (AWS Lambda, Functions Framework) construct one of
 * these and forward their native payloads here; all projection rules live in
 * the shared `applyReadModel` service.
 */
export type ReadModelUpdater = {
  /** AWS / DynamoDB Streams path (kept for the existing local + Lambda RMU). */
  updateReadModel(event: DynamoDBStreamEvent): Promise<void>;
  /** GCP / Pub/Sub path. */
  updateFromPubSub(message: PubSubMessage): Promise<void>;
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
      updateReadModel(event: DynamoDBStreamEvent): Promise<void> {
        return apply(decodeDynamoDBStreamEvent(event));
      },
      updateFromPubSub(message: PubSubMessage): Promise<void> {
        return apply(decodePubSubMessage(message));
      },
    });
  }
}
