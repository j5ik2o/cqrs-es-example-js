import { Aggregate } from "event-store-adapter-js";
import { GroupChatId } from "./group-chat-id";
import { GroupChatName } from "./group-chat-name";
import { Members } from "./members";
import {
  GroupChatCreated,
  GroupChatMemberAdded,
} from "./events/group-chat-events";
import { UserAccountId } from "../user-account";
import { Member, MemberRole } from "./member";
import { Either, left, right } from "fp-ts/Either";

const AddMemberErrorSymbol = Symbol("AddMemberError");

class AddMemberError {
  readonly symbol: typeof AddMemberErrorSymbol = AddMemberErrorSymbol;
  private constructor(public readonly message: string) {}
  static of(message: string): AddMemberError {
    return new AddMemberError(message);
  }
}

type GroupChatError = AddMemberError;

const GroupChatSymbol = Symbol("GroupChat");

class GroupChat implements Aggregate<GroupChat, GroupChatId> {
  readonly symbol: typeof GroupChatSymbol = GroupChatSymbol;

  private constructor(
    public readonly id: GroupChatId,
    private readonly deleted: boolean,
    public readonly name: GroupChatName,
    public readonly members: Members,
    public readonly sequenceNumber: number,
    public readonly version: number,
  ) {}

  static of(
    id: GroupChatId,
    name: GroupChatName,
    executorId: UserAccountId,
  ): [GroupChat, GroupChatCreated] {
    const members = Members.ofSingle(executorId);
    const sequenceNumber = 1;
    const version = 1;
    return [
      new GroupChat(id, false, name, members, sequenceNumber, version),
      GroupChatCreated.of(id, name, members, executorId, sequenceNumber),
    ];
  }

  private static from(
    id: GroupChatId,
    deleted: boolean,
    name: GroupChatName,
    members: Members,
    sequenceNumber: number,
    version: number,
  ): GroupChat {
    return new GroupChat(id, deleted, name, members, sequenceNumber, version);
  }

  addMember(
    userAccountId: UserAccountId,
    memberRole: MemberRole,
    executorId: UserAccountId,
  ): Either<GroupChatError, [GroupChat, GroupChatMemberAdded]> {
    if (this.deleted) {
      return left(AddMemberError.of("The group chat is deleted"));
    }
    if (this.members.isMember(userAccountId)) {
      return left(
        AddMemberError.of(
          "The userAccountId is already the member of the group chat",
        ),
      );
    }
    if (!this.members.isAdministrator(executorId)) {
      return left(
        AddMemberError.of("The executorId is not the member of the group chat"),
      );
    }
    const newMember = Member.of(userAccountId, memberRole);
    const newMembers = this.members.addMember(newMember);
    const sequenceNumber = this.sequenceNumber + 1;
    const newGroupChat = GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      newMembers,
      sequenceNumber,
      this.version,
    );
    const event = GroupChatMemberAdded.of(
      this.id,
      newMember,
      executorId,
      sequenceNumber,
    );
    return right([newGroupChat, event]);
  }

  withVersion(version: number): GroupChat {
    return GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      this.members,
      this.sequenceNumber,
      version,
    );
  }
  updateVersion(version: (value: number) => number): GroupChat {
    return GroupChat.from(
      this.id,
      this.deleted,
      this.name,
      this.members,
      this.sequenceNumber,
      version(this.version),
    );
  }
}

export { GroupChat, GroupChatError, AddMemberError };
