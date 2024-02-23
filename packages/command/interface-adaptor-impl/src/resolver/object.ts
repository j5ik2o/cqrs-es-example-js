import { Field, ObjectType } from "type-graphql";

@ObjectType()
export class GroupChatResult {
  @Field()
  groupChatId!: string;
}

@ObjectType()
export class MessageResult {
  @Field()
  groupChatId!: string;
  @Field()
  messageId!: string;
}

@ObjectType()
export class HealthCheckResult {
  @Field()
  value!: string;
}
