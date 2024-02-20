import { GroupChatCommandProcessor } from "cqrs-es-example-js-command-use-case";
import { Hono } from "hono";
import {
  GroupChatName,
  UserAccountId,
} from "cqrs-es-example-js-command-domain";

export * from "./group-chat";

function createApp(groupChatCommandProcessor: GroupChatCommandProcessor): Hono {
  const app = new Hono();
  app.post("/group-chat/create", async (c) => {
    const { name, executorId } = await c.req.parseBody();
    const _name = GroupChatName.of(name as string);
    const _executorId = UserAccountId.of(executorId as string);
    const groupChat = await groupChatCommandProcessor.createGroupChat(
      _name,
      _executorId,
    );
    return c.json({ group_chat_id: groupChat.aggregateId.asString }, 200);
  });
  return app;
}

export { createApp };
