import {
  GroupChat,
  GroupChatEvent,
  GroupChatId,
} from "cqrs-es-example-js-command-domain";

interface GroupChatRepository {
  storeEvent(event: GroupChatEvent, version: number): Promise<void>;
  storeEventAndSnapshot(
    event: GroupChatEvent,
    snapshot: GroupChat,
  ): Promise<void>;
  findById(id: GroupChatId): Promise<GroupChat | undefined>;
}

export { GroupChatRepository };
