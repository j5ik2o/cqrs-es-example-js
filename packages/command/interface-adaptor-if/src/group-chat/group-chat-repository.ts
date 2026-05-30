import type {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import type { EventStoreError, Result } from "event-store-adapter-js";

/**
 * Decides whether a snapshot should be persisted together with the given event.
 */
export type SnapshotDecider = (
  event: GroupChatEvent,
  snapshot: GroupChat,
) => boolean;

/**
 * The repository contract for group chats. Persistence operations return a
 * `Result` carrying an `EventStoreError` (no exceptions for expected failures
 * such as optimistic-lock conflicts); `findById` resolves to `undefined` when
 * the aggregate does not exist and rejects only on infrastructure errors.
 */
export type GroupChatRepository = {
  withRetention(numberOfEvents: number): GroupChatRepository;

  store(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): Promise<Result<void, EventStoreError>>;

  storeEvent(
    event: GroupChatEvent,
    version: number,
  ): Promise<Result<void, EventStoreError>>;

  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): Promise<Result<void, EventStoreError>>;

  findById(id: GroupChatId): Promise<GroupChat | undefined>;
};
