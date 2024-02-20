import { EventStore } from "event-store-adapter-js";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-domain";

interface GroupChatRepository {
  storeEvent(event: GroupChatEvent, version: number): Promise<void>;
  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): Promise<void>;
  findById(id: GroupChatId): Promise<GroupChat | undefined>;
}

const GroupChatRepository = {
  of(
    eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>,
  ): GroupChatRepository {
    return {
      storeEvent: async (event, version) => {
        await eventStore.persistEvent(event, version);
      },
      storeEventAndSnapshot: async (event, snapshot) => {
        await eventStore.persistEventAndSnapshot(event, snapshot);
      },
      findById: async (id) => {
        const snapshot = await eventStore.getLatestSnapshotById(id);
        if (snapshot === undefined) {
          return undefined;
        } else {
          const events = await eventStore.getEventsByIdSinceSequenceNumber(
            id,
            snapshot.sequenceNumber + 1,
          );
          return GroupChat.replay(events, snapshot);
        }
      },
    };
  },
};

export { GroupChatRepository };
