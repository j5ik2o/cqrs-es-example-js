import {Arg, Mutation, Resolver} from "type-graphql";
import {CreateGroupChatInput} from "./inputs";
import {GroupChatCommandProcessor} from "cqrs-es-example-js-command-use-case";
import {GroupChatName, UserAccountId} from "cqrs-es-example-js-command-domain";
import * as E from "fp-ts/Either";
import {ValidationException} from "../controller/group-chat/group-chat-controller";
import {Response} from "./object";

@Resolver()
export class GroupChatResolver {
    constructor(private readonly groupChatCommandProcessor: GroupChatCommandProcessor) {
    }
    @Mutation()
    async createGroupChat(@Arg("params") params: CreateGroupChatInput): Promise<Response> {
        const nameEither = GroupChatName.validate(params.name as string);
        if (E.isLeft(nameEither)) {
            throw new ValidationException(nameEither.left);
        }
        const _name = nameEither.right;

        const executorIdEither = UserAccountId.validate(params.executorId as string);
        if (E.isLeft(executorIdEither)) {
            throw new ValidationException(executorIdEither.left);
        }
        const _executorId = executorIdEither.right;

        const groupChatEvent = await this.groupChatCommandProcessor.createGroupChat(
            _name,
            _executorId,
        );

        return { groupChatId: groupChatEvent.aggregateId.asString() };
    }
}
