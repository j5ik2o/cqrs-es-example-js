import { Field, ObjectType } from "type-graphql";
import { NaiveDateTime } from "./naive-date-time";

@ObjectType()
class GroupChat {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  ownerId!: string;

  @Field(() => NaiveDateTime)
  createdAt!: Date;

  @Field(() => NaiveDateTime)
  updatedAt!: Date;
}

@ObjectType()
class Member {
  @Field()
  id!: string;

  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  role!: string;

  @Field(() => NaiveDateTime)
  createdAt!: Date;

  @Field(() => NaiveDateTime)
  updatedAt!: Date;
}

@ObjectType()
class Message {
  @Field()
  id!: string;

  @Field()
  groupChatId!: string;

  @Field()
  userAccountId!: string;

  @Field()
  text!: string;

  @Field(() => NaiveDateTime)
  createdAt!: Date;

  @Field(() => NaiveDateTime)
  updatedAt!: Date;
}

export { GroupChat, Member, Message };
