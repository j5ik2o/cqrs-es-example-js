import { EventStore } from "event-store-adapter-js";
import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";
import { GroupChatRepository } from "cqrs-es-example-js-command-interface-adaptor-if";

const GroupChatRepository = {
  of(
    eventStore: EventStore<GroupChatId, GroupChat, GroupChatEvent>,
  ): GroupChatRepository {
    return {
      storeEvent: async (event: GroupChatEvent, version: number) => {
        await eventStore.persistEvent(event, version);
      },
      storeEventAndSnapshot: async (
        event: GroupChatEvent,
        snapshot: GroupChat,
      ) => {
        await eventStore.persistEventAndSnapshot(event, snapshot);
      },
      findById: async (id: GroupChatId) => {
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
