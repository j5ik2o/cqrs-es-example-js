import {AttributeValue, DynamoDBStreamEvent} from "aws-lambda";
import {GroupChatDao} from "./group-chat-dao";

function convertAttributeValueToString(attributeValue: AttributeValue): string {
  if (attributeValue.S !== undefined) {
    return attributeValue.S;
  }
  if (attributeValue.B !== undefined) {
    return attributeValue.B;
  }
  throw new Error("Unexpected attribute value");
}

interface ReadModelUpdater {
  updateReadModel: (event: DynamoDBStreamEvent) => Promise<void>;
}

const ReadModelUpdater = {
  of(_: GroupChatDao): ReadModelUpdater {
    return {
      updateReadModel: async (event: DynamoDBStreamEvent) => {
        console.log("EVENT: \n" + JSON.stringify(event, null, 2));

        event.Records.forEach((record) => {
          console.log(record.eventID);
          console.log(record.eventName);
          console.log("DynamoDB Record: %j", record.dynamodb);
          if (!record.dynamodb) {
            return;
          }
          const attributeValues = record.dynamodb.NewImage;
          if (!attributeValues) {
            return;
          }
          const payload = convertAttributeValueToString(
            attributeValues.payload,
          );
          const payloadJson = JSON.parse(payload);
          console.log("payloadJson: %j", payloadJson);
          const typeName = payloadJson.type_name;
          switch (typeName) {
            case "GroupChatCreated": {
              const groupChatId = payloadJson.group_chat_id;
              const name = payloadJson.name;
              console.log(
                `GroupChatCreated: groupChatId = ${groupChatId}, name = ${name}`,
              );
              break;
            }
            case "GroupChatDeleted": {
              const groupChatId = payloadJson.group_chat_id;
              console.log(`GroupChatDeleted: groupChatId = ${groupChatId}`);
              break;
            }
          }
        });
      },
    };
  },
};

export { ReadModelUpdater };
