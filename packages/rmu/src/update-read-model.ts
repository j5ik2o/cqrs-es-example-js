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
      const rawPayload = attributeValues.payload.B;
      if (!rawPayload) {
        this.logger.warn("No payload");
        return;
      }
      let payloadJson: unknown;
      try {
        // LocalStack: B フィールドに生 JSON 文字列が入る
        payloadJson = JSON.parse(rawPayload);
      } catch {
        // AWS Lambda: Base64, ローカル RMU: カンマ区切り数値文字列
        const payloadBytes = /^\d+(,\d+)*$/.test(rawPayload)
          ? new Uint8Array(rawPayload.split(",").map(Number))
          : new Uint8Array(Buffer.from(rawPayload, "base64"));
        payloadJson = JSON.parse(this.decoder.decode(payloadBytes));
      }
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
