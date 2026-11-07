import { Field, InputType, registerEnumType } from "type-graphql";

export enum Role {
  MEMBER = "MEMBER",
  ADMIN = "ADMIN",
}

registerEnumType(Role, {
  name: "Role",
  description: "The role of a group chat member.",
});

@InputType()
class CreateGroupChatInput {
  @Field()
  name!: string;

  @Field()
  executorId!: string;
}

@InputType()
class DeleteGroupChatInput {
  @Field()
  groupChatId!: string;

  @Field()
  executorId!: string;
}

@InputType()
class RenameGroupChatInput {
  @Field()
  groupChatId!: string;

  @Field()
  name!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class AddMemberInput {
  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field(() => Role)
  role!: Role;

  @Field()
  executorId!: string;
}

@InputType()
class RemoveMemberInput {
  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  executorId!: string;
}

@InputType()
class PostMessageInput {
  @Field()
  groupChatId!: string;

  @Field()
  content!: string;

  @Field()
  executorId!: string;
}

@InputType()
class EditMessageInput {
  @Field()
  groupChatId!: string;

  @Field()
  messageId!: string;

  @Field()
  content!: string;

  @Field()
  executorId!: string;
}

@InputType()
class DeleteMessageInput {
  @Field()
  groupChatId!: string;

  @Field()
  messageId!: string;

  @Field()
  executorId!: string;
}

export {
  CreateGroupChatInput,
  DeleteGroupChatInput,
  RenameGroupChatInput,
  RemoveMemberInput,
  PostMessageInput,
  EditMessageInput,
  DeleteMessageInput,
};
