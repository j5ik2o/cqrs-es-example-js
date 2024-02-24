import { Field, ObjectType } from "type-graphql";

@ObjectType()
class GroupChatResult {
  @Field()
  groupChatId!: string;
}

@ObjectType()
class MessageResult {
  @Field()
  groupChatId!: string;
  @Field()
  messageId!: string;
}

@ObjectType()
class HealthCheckResult {
  @Field()
  value!: string;
}

export { GroupChatResult, MessageResult, HealthCheckResult };
