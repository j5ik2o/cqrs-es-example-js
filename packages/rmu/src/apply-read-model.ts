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
  // Use the event's own occurredAt for the read-model timestamps: it is decoded
  // from the payload and is always a valid date, unlike the provider stream's
  // ambiguous ApproximateCreationDateTime.
  const at = event.occurredAt;
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
      );
      break;
    }
    case "GroupChatRenamed":
      await dao.updateGroupChatName(event.aggregateId, event.name, at);
      break;
    case "GroupChatMemberAdded":
      await dao.insertMember(event.aggregateId, event.member, at);
      break;
    case "GroupChatMemberRemoved":
      await dao.deleteMember(event.aggregateId, event.member.userAccountId);
      break;
    case "GroupChatMessagePosted":
      await dao.insertMessage(event.aggregateId, event.message, at);
      break;
    case "GroupChatMessageDeleted":
      await dao.deleteMessage(event.message.id, at);
      break;
    case "GroupChatDeleted":
      await dao.deleteGroupChat(event.aggregateId, at);
      break;
    default: {
      const exhaustive: never = event;
      throw new Error(`Unknown GroupChatEvent: ${String(exhaustive)}`);
    }
  }
}

export { applyReadModel };
