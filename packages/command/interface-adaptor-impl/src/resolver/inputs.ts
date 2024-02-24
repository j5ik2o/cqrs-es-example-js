import { Field, InputType } from "type-graphql";

@InputType()
export class CreateGroupChatInput {
  @Field()
  name!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class DeleteGroupChatInput {
  @Field()
  groupChatId!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class RenameGroupChatInput {
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

  @Field()
  role!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class RemoveMemberInput {
  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class PostMessageInput {
  @Field()
  groupChatId!: string;

  @Field()
  content!: string;

  @Field()
  executorId!: string;
}

@InputType()
export class DeleteMessageInput {
  @Field()
  groupChatId!: string;

  @Field()
  messageId!: string;

  @Field()
  executorId!: string;
}
