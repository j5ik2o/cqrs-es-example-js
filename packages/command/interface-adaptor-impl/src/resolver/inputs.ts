import { Field, InputType } from "type-graphql";

@InputType()
export class CreateGroupChatInput {
  @Field()
  name!: string;

  @Field()
  executorId!: string;
}
