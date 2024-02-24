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
  GroupChatRenamedTypeSymbol, MemberId,
} from "cqrs-es-example-js-command-domain";
// import {Callback} from "aws-lambda/handler";

// const lambdaHandler: Handler<DynamoDBStreamEvent, void> = async (event: DynamoDBStreamEvent, context: Context, callback: Callback<void>) => {
//
// }

interface ReadModelUpdater {
  updateReadModel: (event: DynamoDBStreamEvent) => Promise<void>;
}

const ReadModelUpdater = {
  of(groupChatDao: GroupChatDao): ReadModelUpdater {
    const decoder = new TextDecoder("utf-8");
    return {
      updateReadModel: async (event: DynamoDBStreamEvent) => {
        console.log("EVENT: \n" + JSON.stringify(event, null, 2));
        event.Records.forEach((record) => {
          if (!record.dynamodb) {
            console.log("No DynamoDB record");
            return;
          }
          const attributeValues = record.dynamodb.NewImage;
          if (!attributeValues) {
            console.log("No NewImage");
            return;
          }
          const base64EncodedPayload = attributeValues.payload.B;
          if (!base64EncodedPayload) {
            console.log("No payload");
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
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.insertGroupChat(
                typedEvent.aggregateId,
                typedEvent.name,
                typedEvent.members.values[0].userAccountId,
                new Date(),
              );
              console.log("inserted group chat");
              const memberId = MemberId.generate();
              groupChatDao.insertGroupChatMember(memberId,typedEvent.aggregateId, typedEvent.members.values[0].userAccountId, "administrator", new Date());
              console.log("inserted member");
              break;
            }
            case GroupChatDeletedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatDeleted;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteGroupChat(typedEvent.aggregateId, new Date());
              console.log("deleted group chat");
              break;
            }
            case GroupChatRenamedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatRenamed;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.updateGroupChatName(
                typedEvent.aggregateId,
                typedEvent.name,
                new Date(),
              );
              console.log("updated group chat name");
              break;
            }
            case GroupChatMemberAddedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMemberAdded;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.insertGroupChatMember(
                typedEvent.member.id,
                typedEvent.aggregateId,
                typedEvent.member.userAccountId,
                typedEvent.member.memberRole,
                new Date(),
              );
              console.log("inserted group chat member");
              break;
            }
            case GroupChatMemberRemovedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMemberRemoved;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteMember(
                typedEvent.aggregateId,
                typedEvent.member.userAccountId,
              );
              console.log("deleted group chat member");
              break;
            }
            case GroupChatMessagePostedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMessagePosted;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.insertMessage(
                typedEvent.aggregateId,
                typedEvent.message,
                new Date(),
              );
              break;
            }
            case GroupChatMessageDeletedTypeSymbol: {
              const typedEvent = groupChatEvent as GroupChatMessageDeleted;
              console.log(`event = ${typedEvent.toString()}`);
              groupChatDao.deleteMessage(typedEvent.message.id, new Date());
              console.log("deleted message");
              break;
            }
          }
        });
      },
    };
  },
};

export { ReadModelUpdater };
