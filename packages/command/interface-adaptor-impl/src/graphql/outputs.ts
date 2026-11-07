import { Field, ObjectType } from "type-graphql";

@ObjectType()
class GroupChatOutput {
  @Field()
  groupChatId!: string;
}

@ObjectType()
class MessageOutput {
  @Field()
  groupChatId!: string;
  @Field()
  messageId!: string;
}

export { GroupChatOutput, MessageOutput };
