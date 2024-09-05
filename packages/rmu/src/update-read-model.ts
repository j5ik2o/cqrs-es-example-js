import { TextDecoder } from "node:util";
import type { DynamoDBStreamEvent } from "aws-lambda";
import {
  type GroupChatCreated,
  GroupChatCreatedTypeSymbol,
  type GroupChatDeleted,
  GroupChatDeletedTypeSymbol,
  type GroupChatMemberAdded,
  GroupChatMemberAddedTypeSymbol,
  type GroupChatMemberRemoved,
  GroupChatMemberRemovedTypeSymbol,
  type GroupChatMessageDeleted,
  GroupChatMessageDeletedTypeSymbol,
  type GroupChatMessagePosted,
  GroupChatMessagePostedTypeSymbol,
  type GroupChatRenamed,
  GroupChatRenamedTypeSymbol,
  convertJSONToGroupChatEvent,
} from "cqrs-es-example-js-command-domain";
import { type ILogObj, Logger } from "tslog";
import type { GroupChatDao } from "./group-chat-dao";

// import {Callback} from "aws-lambda/handler";

// const lambdaHandler: Handler<DynamoDBStreamEvent, void> = async (event: DynamoDBStreamEvent, context: Context, callback: Callback<void>) => {
//
// }

class ReadModelUpdater {
  private logger: Logger<ILogObj> = new Logger();
  private decoder: TextDecoder = new TextDecoder("utf-8");

  private constructor(private readonly groupChatDao: GroupChatDao) {}

  async updateReadModel(event: DynamoDBStreamEvent): Promise<void> {
    this.logger.info(`EVENT: \n${JSON.stringify(event, null, 2)}`);
    for (const record of event.Records) {
      if (!record.dynamodb) {
        this.logger.warn("No DynamoDB record");
        return;
      }
      const attributeValues = record.dynamodb.NewImage;
      if (!attributeValues) {
        this.logger.warn("No NewImage");
        return;
      }
      const base64EncodedPayload = attributeValues.payload.B;
      if (!base64EncodedPayload) {
        this.logger.warn("No payload");
        return;
      }
      const payload = this.decoder.decode(
        new Uint8Array(base64EncodedPayload.split(",").map(Number)),
      );
      const payloadJson = JSON.parse(payload);
      const groupChatEvent = convertJSONToGroupChatEvent(payloadJson);
      switch (groupChatEvent.symbol) {
        case GroupChatCreatedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatCreated;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.insertGroupChat(
            typedEvent.aggregateId,
            typedEvent.name,
            typedEvent.members.toArray()[0].userAccountId,
            new Date(),
          );
          this.logger.debug("inserted group chat");
          break;
        }
        case GroupChatDeletedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatDeleted;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.deleteGroupChat(
            typedEvent.aggregateId,
            new Date(),
          );
          this.logger.debug("deleted group chat");
          break;
        }
        case GroupChatRenamedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatRenamed;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.updateGroupChatName(
            typedEvent.aggregateId,
            typedEvent.name,
            new Date(),
          );
          this.logger.debug("updated group chat name");
          break;
        }
        case GroupChatMemberAddedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatMemberAdded;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.insertGroupChatMember(
            typedEvent.member.id,
            typedEvent.aggregateId,
            typedEvent.member.userAccountId,
            typedEvent.member.memberRole,
            new Date(),
          );
          this.logger.debug("inserted member");
          break;
        }
        case GroupChatMemberRemovedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatMemberRemoved;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.deleteMember(
            typedEvent.aggregateId,
            typedEvent.member.userAccountId,
          );
          this.logger.debug("deleted member");
          break;
        }
        case GroupChatMessagePostedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatMessagePosted;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.insertMessage(
            typedEvent.aggregateId,
            typedEvent.message,
            new Date(),
          );
          this.logger.debug("inserted message");
          break;
        }
        case GroupChatMessageDeletedTypeSymbol: {
          const typedEvent = groupChatEvent as GroupChatMessageDeleted;
          this.logger.debug(`event = ${typedEvent.toString()}`);
          await this.groupChatDao.deleteMessage(
            typedEvent.message.id,
            new Date(),
          );
          this.logger.debug("deleted message");
          break;
        }
      }
    }
  }

  static of(groupChatDao: GroupChatDao): ReadModelUpdater {
    return new ReadModelUpdater(groupChatDao);
  }
}

export { ReadModelUpdater };
