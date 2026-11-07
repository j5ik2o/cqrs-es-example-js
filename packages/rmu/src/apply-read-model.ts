import { GroupChatId } from "cqrs-es-example-js-command-domain";
import type { GroupChatDao } from "./group-chat-dao";
import type { ReadModelUpdaterInput } from "./read-model-updater-input";

/**
 * Shared, provider-neutral projection logic. Switches on the decoded domain
 * event's `typeName` (not a runtime symbol) and applies it through the DAO.
 * Safe to call more than once for the same event (the DAO is idempotent).
 *
 * ESA v5 keeps the aggregate id, sequence number and occurrence time in the
 * storage envelope, so they come from `ReadModelUpdaterInput`, not the payload.
 */
async function applyReadModel(
  dao: GroupChatDao,
  input: ReadModelUpdaterInput,
): Promise<void> {
  const { event } = input;
  const aggregateId = GroupChatId.of(input.aggregateId);
  const at = input.occurredAt ?? input.observedAt;
  switch (event.typeName) {
    case "GroupChatCreated": {
      const administrator = event.members.values[0];
      if (administrator === undefined) {
        throw new Error("GroupChatCreated must contain an administrator");
      }
      await dao.insertGroupChat(
        aggregateId,
        event.name,
        administrator,
        at,
        input.sequenceNumber,
      );
      break;
    }
    case "GroupChatRenamed":
      await dao.updateGroupChatName(
        aggregateId,
        event.name,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatMemberAdded":
      await dao.insertMember(
        aggregateId,
        event.member,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatMemberRemoved":
      await dao.deleteMember(
        aggregateId,
        event.member.userAccountId,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatMessagePosted":
      await dao.insertMessage(
        aggregateId,
        event.message,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatMessageEdited":
      await dao.updateMessage(
        aggregateId,
        event.message,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatMessageDeleted":
      await dao.deleteMessage(
        aggregateId,
        event.message.id,
        at,
        input.sequenceNumber,
      );
      break;
    case "GroupChatDeleted":
      await dao.deleteGroupChat(aggregateId, at, input.sequenceNumber);
      break;
    default: {
      const exhaustive: never = event;
      throw new Error(`Unknown GroupChatEvent: ${String(exhaustive)}`);
    }
  }
}

export { applyReadModel };
