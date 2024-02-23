import {Arg, Ctx, Mutation, Query, Resolver} from "type-graphql";
import { CreateGroupChatInput, DeleteGroupChatInput } from "./inputs";
import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import {
  GroupChatId,
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";
import * as E from "fp-ts/Either";
import { ValidationException } from "../controller/group-chat/group-chat-controller";
import {GroupChatResult, HealthCheckResult} from "./object";

interface CommandContext {
  groupChatCommandProcessor: GroupChatCommandProcessor
}

@Resolver(() => GroupChatResult)
class GroupChatResolver {
  @Query(() => HealthCheckResult)
  async healthCheck(): Promise<HealthCheckResult> {
    return { value: "OK" }
  }

  @Mutation(() => GroupChatResult)
  async createGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("params") params: CreateGroupChatInput,
  ): Promise<GroupChatResult> {
    const nameEither = GroupChatName.validate(params.name as string);
    if (E.isLeft(nameEither)) {
      throw new ValidationException(nameEither.left);
    }
    const name = nameEither.right;

    const executorIdEither = UserAccountId.validate(
      params.executorId as string,
    );
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.createGroupChat(
      name,
      executorId,
    );

    return { groupChatId: groupChatEvent.aggregateId.asString() };
  }

  @Mutation(() => GroupChatResult)
  async deleteGroupChat(
    @Ctx() { groupChatCommandProcessor }: CommandContext,
    @Arg("params") params: DeleteGroupChatInput,
  ): Promise<GroupChatResult> {
    const groupChatIdEither = GroupChatId.validate(
      params.groupChatId as string,
    );
    if (E.isLeft(groupChatIdEither)) {
      throw new ValidationException(groupChatIdEither.left);
    }
    const groupChatId = groupChatIdEither.right;

    const executorIdEither = UserAccountId.validate(
      params.executorId as string,
    );
    if (E.isLeft(executorIdEither)) {
      throw new ValidationException(executorIdEither.left);
    }
    const executorId = executorIdEither.right;

    const groupChatEvent = await groupChatCommandProcessor.deleteGroupChat(
      groupChatId,
      executorId,
    );

    return { groupChatId: groupChatEvent.aggregateId.asString() };
  }
}

export { CommandContext, GroupChatResolver }