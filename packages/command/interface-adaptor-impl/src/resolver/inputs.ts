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
