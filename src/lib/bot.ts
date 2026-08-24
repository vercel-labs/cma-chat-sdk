import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import { connectSlackAdapter } from "@vercel/connect/chat";
import { Chat } from "chat";
import { config } from "./config";
import { handleResearchMessage, type ThreadState } from "./research-handler";

const adapters = {
  slack: createSlackAdapter({
    ...connectSlackAdapter(config.slackConnector),
  }),
};

/**
 * Chat SDK instance for the Connect-managed Slack app.
 *
 * @remarks
 * Redis provides durable subscriptions, deduplication, and thread state.
 * Turn ordering is handled separately by the Managed Agents bridge.
 */
export const bot = new Chat<typeof adapters, ThreadState>({
  adapters,
  concurrency: "concurrent",
  state: createRedisState({ url: config.redisUrl }),
  userName: config.botUsername,
});

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await handleResearchMessage(thread, message, "new-mention");
});

bot.onSubscribedMessage(async (thread, message) => {
  await handleResearchMessage(thread, message, "subscribed");
});

bot.onDirectMessage(async (thread, message) => {
  await handleResearchMessage(thread, message, "direct");
});
