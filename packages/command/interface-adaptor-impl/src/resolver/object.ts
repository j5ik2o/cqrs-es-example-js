import {Field, ObjectType} from "type-graphql";

@ObjectType()
export class Response {
    @Field()
    groupChatId!: string
}
