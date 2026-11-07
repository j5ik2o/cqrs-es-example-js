import type { GroupChatDao } from "./group-chat-dao";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

/**
 * Shared, provider-neutral projection logic. Switches on the decoded domain
 * event's `typeName` (not a runtime symbol) and applies it through the DAO.
 * Safe to call more than once for the same event (the DAO is idempotent).
 */
async function applyReadModel(
  dao: GroupChatDao,
  input: ReadModelUpdaterInput,
): Promise<void> {
  const { event } = input;
  // The storage envelope's occurred_at is authoritative for v5 head records;
  // fall back to the decoded event's timestamp for payloads that still carry
  // it (and for providers without an envelope).
  const at = input.occurredAt ?? event.occurredAt;
  const sequenceNumber = input.sequenceNumber;
  switch (event.typeName) {
    case "GroupChatCreated": {
      const administrator = event.members.values[0];
      if (administrator === undefined) {
        throw new Error("GroupChatCreated must contain an administrator");
      }
      await dao.insertGroupChat(
        event.aggregateId,
        event.name,
        administrator,
        at,
        sequenceNumber,
      );
      break;
    }
    case "GroupChatRenamed":
      await dao.updateGroupChatName(
        event.aggregateId,
        event.name,
        at,
        sequenceNumber,
      );
      break;
    case "GroupChatMemberAdded":
      await dao.insertMember(
        event.aggregateId,
        event.member,
        at,
        sequenceNumber,
      );
      break;
    case "GroupChatMemberRemoved":
      await dao.deleteMember(
        event.aggregateId,
        event.member.userAccountId,
        at,
        sequenceNumber,
      );
      break;
    case "GroupChatMessagePosted":
      await dao.insertMessage(
        event.aggregateId,
        event.message,
        at,
        sequenceNumber,
      );
      break;
    case "GroupChatMessageDeleted":
      await dao.deleteMessage(
        event.aggregateId,
        event.message.id,
        at,
        sequenceNumber,
      );
      break;
    case "GroupChatDeleted":
      await dao.deleteGroupChat(event.aggregateId, at, sequenceNumber);
      break;
    default: {
      const exhaustive: never = event;
      throw new Error(`Unknown GroupChatEvent: ${String(exhaustive)}`);
    }
  }
}

export { applyReadModel };
