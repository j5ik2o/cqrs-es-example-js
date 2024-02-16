import { Aggregate } from "event-store-adapter-js/src/types";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import { GroupChatCreated } from "./events/group-chat-events";
import { ulid } from "ulidx";
import { UserAccountId } from "../user-account";

class GroupChat implements Aggregate<GroupChat, GroupChatId> {
  private constructor(
    public readonly id: GroupChatId,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly sequenceNumber: number,
    public readonly version: number,
  ) {}

  static of(
    id: GroupChatId,
    name: GroupChatName,
    members: Members,
    executorId: UserAccountId,
    sequenceNumber: number,
    version: number,
  ): [GroupChat, GroupChatCreated] {
    return [
      new GroupChat(id, name, members, sequenceNumber, version),
      GroupChatCreated.of(
        ulid(),
        id,
        name,
        members,
        executorId,
        sequenceNumber,
      ),
    ];
  }

  private static from(
    id: GroupChatId,
    name: GroupChatName,
    members: Members,
    sequenceNumber: number,
    version: number,
  ): GroupChat {
    return new GroupChat(id, name, members, sequenceNumber, version);
  }

  withVersion(version: number): GroupChat {
    return GroupChat.from(
      this.id,
      this.name,
      this.members,
      this.sequenceNumber,
      version,
    );
  }
  updateVersion(version: (value: number) => number): GroupChat {
    return GroupChat.from(
      this.id,
      this.name,
      this.members,
      this.sequenceNumber,
      version(this.version),
    );
  }
}

export { GroupChat };
