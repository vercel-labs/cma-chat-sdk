import { after } from "next/server";
import { bot } from "@/lib/bot";

// Types
type Platform = keyof typeof bot.webhooks;

interface Context {
  params: Promise<{ platform: string }>;
}

export const maxDuration = 300;

async function handleRequest(request: Request, context: Context) {
  const { platform } = await context.params;

  const handler = bot.webhooks[platform as Platform];

  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
}

export const GET = handleRequest;
export const POST = handleRequest;
