import { Field, ObjectType } from "type-graphql";

@ObjectType()
class GroupChatOutput {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  ownerId!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
class MemberOutput {
  @Field()
  id!: string;

  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  role!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
class MessageOutput {
  @Field()
  id!: string;

  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  text!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

export { GroupChatOutput, MemberOutput, MessageOutput };
