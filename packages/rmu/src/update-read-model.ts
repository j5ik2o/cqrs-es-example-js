import { DynamoDBStreamEvent } from "aws-lambda";
import { GroupChatDao } from "./group-chat-dao";
import {
  convertJSONToGroupChatEvent,
  GroupChatCreated,
  GroupChatCreatedTypeSymbol,
  GroupChatDeleted,
  GroupChatDeletedTypeSymbol,
  GroupChatMemberAdded,
  GroupChatMemberAddedTypeSymbol,
  GroupChatMemberRemoved,
  GroupChatMemberRemovedTypeSymbol,
  GroupChatMessageDeleted,
  GroupChatMessageDeletedTypeSymbol,
  GroupChatMessagePosted,
  GroupChatMessagePostedTypeSymbol,
  GroupChatRenamed,
  GroupChatRenamedTypeSymbol,
} from "cqrs-es-example-js-command-domain";
import { ILogObj, Logger } from "tslog";
// import {Callback} from "aws-lambda/handler";

// const lambdaHandler: Handler<DynamoDBStreamEvent, void> = async (event: DynamoDBStreamEvent, context: Context, callback: Callback<void>) => {
//
// }

interface ReadModelUpdater {
  updateReadModel: (event: DynamoDBStreamEvent) => Promise<void>;
}

const ReadModelUpdater = {
  of(groupChatDao: GroupChatDao): ReadModelUpdater {
    const logger: Logger<ILogObj> = new Logger();
    const decoder = new TextDecoder("utf-8");
    return {
      updateReadModel: async (event: DynamoDBStreamEvent) => {
        logger.info("EVENT: \n" + JSON.stringify(event, null, 2));
        event.Records.forEach((record) => {
          if (!record.dynamodb) {
            logger.warn("No DynamoDB record");
            return;
          }
          const attributeValues = record.dynamodb.NewImage;
          if (!attributeValues) {
            logger.warn("No NewImage");
            return;
          }
          const base64EncodedPayload = attributeValues.payload.B;
          if (!base64EncodedPayload) {
            logger.warn("No payload");
            return;
          }
          const payload = decoder.decode(
            new Uint8Array(base64EncodedPayload.split(",").map(Number)),
          );
          const payloadJson = JSON.parse(payload);
          const groupChatEvent = convertJSONToGroupChatEvent(payloadJson);
          switch (groupChatEvent.symbol) {
            case GroupChatCreatedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatCreated;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.insertGroupChat(
                typedEvent.aggregateId,
                typedEvent.name,
                typedEvent.members.values[0].userAccountId,
                new Date(),
              );
              logger.debug("inserted group chat");
              break;
            }
            case GroupChatDeletedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatDeleted;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteGroupChat(typedEvent.aggregateId, new Date());
              logger.debug("deleted group chat");
              break;
            }
            case GroupChatRenamedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatRenamed;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.updateGroupChatName(
                typedEvent.aggregateId,
                typedEvent.name,
                new Date(),
              );
              logger.debug("updated group chat name");
              break;
            }
            case GroupChatMemberAddedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMemberAdded;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.insertGroupChatMember(
                typedEvent.member.id,
                typedEvent.aggregateId,
                typedEvent.member.userAccountId,
                typedEvent.member.memberRole,
                new Date(),
              );
              logger.debug("inserted member");
              break;
            }
            case GroupChatMemberRemovedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMemberRemoved;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteMember(
                typedEvent.aggregateId,
                typedEvent.member.userAccountId,
              );
              logger.debug("deleted member");
              break;
            }
            case GroupChatMessagePostedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMessagePosted;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.insertMessage(
                typedEvent.aggregateId,
                typedEvent.message,
                new Date(),
              );
              logger.debug("inserted message");
              break;
            }
            case GroupChatMessageDeletedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMessageDeleted;
              logger.debug(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteMessage(typedEvent.message.id, new Date());
              logger.debug("deleted message");
              break;
            }
          }
        });
      },
    };
  },
};

export { ReadModelUpdater };
