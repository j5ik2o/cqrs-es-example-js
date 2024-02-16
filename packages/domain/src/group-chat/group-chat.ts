import { Aggregate } from "event-store-adapter-js/src/types";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {GroupChatCreated, GroupChatMemberAdded} from "./events/group-chat-events";
import { UserAccountId } from "../user-account";
import {MemberRole} from "./member";
import {Either} from "fp-ts/Either";

const AddMemberErrorSymbol = Symbol("AddMemberError");

class AddMemberError {
  readonly symbol: typeof AddMemberErrorSymbol = AddMemberErrorSymbol;
}

type GroupChatError = AddMemberError;


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
  ): [GroupChat, GroupChatCreated] {
    const sequenceNumber = 1;
    const version = 1;
    return [
      new GroupChat(id, name, members, sequenceNumber, version),
      GroupChatCreated.of(
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

  // addMember(userAccountId: UserAccountId, memberRole: MemberRole, executorId: UserAccountId): Either<GroupChatError, [GroupChat, GroupChatMemberAdded]> {
  //   return null;
  // }

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

export { GroupChat, GroupChatError, AddMemberError };
