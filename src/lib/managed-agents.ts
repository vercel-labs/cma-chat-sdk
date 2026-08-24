import Anthropic from "@anthropic-ai/sdk";
import {
  type AccumulatedEvent,
  accumulateManagedAgentsEvent,
} from "@anthropic-ai/sdk/lib/sessions/accumulate";
import { config } from "./config";
import { debugCard, type TurnStats } from "./debug-card";

// Types
/**
 * Minimal Chat SDK thread contract required by the Managed Agents bridge.
 *
 * @remarks
 * Keeping this structural makes the bridge independent of a specific chat
 * adapter while supporting both complete and streamed posts.
 */
export interface BotThread {
  id: string;
  post: (
    message: string | AsyncIterable<string> | ReturnType<typeof debugCard>
  ) => Promise<unknown>;
}

export interface CreateManagedSessionOptions {
  source?: string;
  threadId: string;
  title: string;
}

type EventContent = { type: string; text?: string }[] | null | undefined;

interface StreamingPost {
  finish: () => Promise<unknown>;
  push: (text: string) => void;
  sent: string;
}

interface Preview {
  acc: AccumulatedEvent | undefined;
  post: StreamingPost;
}

interface TurnResult {
  finished: boolean;
  replied: boolean;
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const SESSION_ENDED =
  "This research session is no longer available. Start a new Slack thread to continue.";
const TITLE_MAX = 60;

class StreamDropped extends Error {
  constructor() {
    super("event stream ended before the turn completed");
  }
}

function errorLabel(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `${error.name}:${error.status}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/**
 * Creates a fresh Managed Agents session for a chat thread.
 *
 * @param options - Chat thread identity, title, and optional creation source.
 * @returns The newly created session ID.
 * @throws Error when required configuration is missing or Anthropic rejects the
 * request.
 */
export async function createManagedSession(
  options: CreateManagedSessionOptions
): Promise<string> {
  const session = await client.beta.sessions.create({
    agent: config.agentId,
    environment_id: config.environmentId,
    metadata: {
      slack_thread_id: options.threadId,
      ...(options.source ? { source: options.source } : {}),
    },
    title: truncate(options.title, TITLE_MAX),
  });
  console.log(`[managed-agent] new session ${session.id}`);
  return session.id;
}

/**
 * Retrieves a session only when it is safe for this bot to use.
 *
 * @param sessionId - Untrusted session ID loaded from thread state.
 * @returns The active session when it belongs to the configured agent;
 * otherwise `null`.
 * @throws Re-throws transient API and network failures so callers do not treat
 * them as an expired session.
 */
export async function ownedSession(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }

  try {
    const session = await client.beta.sessions.retrieve(sessionId);
    if (session.agent.id !== config.agentId) {
      return null;
    }
    if (
      typeof session.archived_at === "string" ||
      session.status === "terminated"
    ) {
      return null;
    }
    return session;
  } catch (error) {
    if (
      error instanceof Anthropic.APIError &&
      (error.status === 400 || error.status === 404 || error.status === 410)
    ) {
      return null;
    }
    throw error;
  }
}

const queues = new Map<string, Promise<void>>();

/**
 * Serializes turns within one server process.
 *
 * @param threadId - Stable Chat SDK thread ID used as the queue key.
 * @param turn - Work to run after the preceding turn settles.
 * @returns A promise for this queued turn.
 * @remarks
 * This queue is process-local. Cross-instance correctness comes from the
 * server-side event anchor in {@link runTurn}.
 */
export function enqueueTurn(
  threadId: string,
  turn: () => Promise<void>
): Promise<void> {
  const previous = queues.get(threadId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(turn);
  queues.set(threadId, next);
  next
    .catch(() => undefined)
    .finally(() => {
      if (queues.get(threadId) === next) {
        queues.delete(threadId);
      }
    });
  return next;
}

function rawTextOf(content: EventContent): string {
  // Citation metadata can split one sentence across adjacent text blocks.
  // Each block already carries its required spaces and punctuation.
  return (content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
}

function streamingPost(thread: BotThread): StreamingPost {
  let pending = "";
  let closed = false;
  let wake: () => void = () => {
    // Replaced by the pending fragment waiter.
  };
  let posting: Promise<unknown> | undefined;

  const fragments = (async function* streamFragments() {
    for (;;) {
      if (pending) {
        const chunk = pending;
        pending = "";
        yield chunk;
        continue;
      }
      if (closed) {
        return;
      }
      // biome-ignore lint/performance/noAwaitInLoops: The stream must pause until a fragment arrives.
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  })();

  const post: StreamingPost = {
    finish() {
      closed = true;
      wake();
      return posting ?? Promise.resolve();
    },
    push(text) {
      if (!text) {
        return;
      }
      post.sent += text;
      pending += text;
      if (!posting) {
        posting = thread.post(fragments);
        posting.catch(() => undefined);
      }
      wake();
    },
    sent: "",
  };

  return post;
}

/**
 * Sends one user turn to a Managed Agents session and streams replies to chat.
 *
 * @param thread - Chat thread that receives agent messages and diagnostics.
 * @param sessionId - Stored Managed Agents session ID to validate and use.
 * @param text - User-authored message for this turn.
 * @returns A promise that resolves after the turn reaches a terminal state.
 * @remarks
 * The event stream opens before the user message is sent. Failures are reported
 * to the thread rather than exposed as rejected handler promises.
 */
export async function runTurn(
  thread: BotThread,
  sessionId: string,
  text: string
): Promise<void> {
  try {
    const session = await ownedSession(sessionId);
    if (!session) {
      await thread.post(SESSION_ENDED);
      return;
    }

    const stats = createTurnStats(sessionId);
    const startedAt = Date.now();
    const result = await streamTurn(thread, sessionId, text, stats);
    stats.seconds += Math.round((Date.now() - startedAt) / 1000);

    await postTurnDiagnostics(thread, stats, result);
  } catch (error) {
    await reportTurnFailure(thread, sessionId, error);
  }
}

function createTurnStats(sessionId: string): TurnStats {
  return {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    fetches: 0,
    inputTokens: 0,
    modelRequests: 0,
    outputTokens: 0,
    searches: 0,
    seconds: 0,
    sessionId,
  };
}

async function postTurnDiagnostics(
  thread: BotThread,
  stats: TurnStats,
  result: TurnResult
): Promise<void> {
  if (!(result.finished && result.replied && config.debugMode)) {
    return;
  }
  try {
    await thread.post(debugCard(stats));
  } catch (error) {
    console.warn(
      `[managed-agent] ${stats.sessionId} trailing post failed (${errorLabel(error)})`
    );
  }
}

async function reportTurnFailure(
  thread: BotThread,
  sessionId: string,
  error: unknown
): Promise<void> {
  console.error(
    `[managed-agent] turn failed for ${sessionId} (${errorLabel(error)})`
  );
  const message =
    error instanceof StreamDropped
      ? "I lost my connection mid-research, but the work continues on Anthropic's side. Check this thread again in a minute or two; please don't resend yet."
      : "I hit a snag while running that research turn. Please send it again.";
  await thread.post(message).catch(() => undefined);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is Anthropic's event-loop state machine.
async function streamTurn(
  thread: BotThread,
  sessionId: string,
  text: string,
  stats: TurnStats
): Promise<TurnResult> {
  const stream = await client.beta.sessions.events.stream(sessionId, {
    event_deltas: ["agent.message"],
  });

  let anchorId: string | undefined;
  try {
    const sent = await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          content: [{ text, type: "text" }],
          type: "user.message",
        },
      ],
    });
    anchorId = sent.data?.find((event) => event.type === "user.message")?.id;
  } catch (error) {
    stream.controller.abort();
    throw error;
  }

  let anchored = anchorId === undefined;
  const previews = new Map<string, Preview>();
  let replied = false;

  const advance = (
    preview: Preview,
    event: Parameters<typeof accumulateManagedAgentsEvent>[1]
  ) => {
    try {
      preview.acc = accumulateManagedAgentsEvent(preview.acc, event);
    } catch {
      return;
    }
    const soFar = rawTextOf(preview.acc?.content as EventContent);
    if (soFar.startsWith(preview.post.sent)) {
      preview.post.push(soFar.slice(preview.post.sent.length));
    }
  };

  const closeOpenPreviews = async () => {
    const drains = [...previews.values()].map((preview) =>
      preview.post.finish().catch(() => undefined)
    );
    previews.clear();
    await Promise.all(drains);
  };

  try {
    for await (const event of stream) {
      if (!anchored) {
        if (event.type === "user.message") {
          if (event.id === anchorId) {
            anchored = true;
          }
          continue;
        }
        if (
          event.type === "session.status_idle" &&
          event.stop_reason?.type === "requires_action"
        ) {
          await thread.post(
            "The agent asked for an approval this bot can't handle. Start a new Slack thread and restore the agent's always-allow tool policy."
          );
          return { finished: false, replied };
        }
        if (
          event.type !== "session.status_terminated" &&
          event.type !== "session.deleted"
        ) {
          continue;
        }
      }

      switch (event.type) {
        case "event_start":
          if (event.event.type === "agent.message") {
            previews.set(event.event.id, {
              acc: undefined,
              post: streamingPost(thread),
            });
            advance(previews.get(event.event.id) as Preview, event);
          }
          break;
        case "event_delta": {
          const preview = previews.get(event.event_id);
          if (preview) {
            advance(preview, event);
          }
          break;
        }
        case "agent.message": {
          const preview = previews.get(event.id);
          const full = rawTextOf(event.content as EventContent);
          const hasText = full.trim() !== "";
          if (hasText) {
            replied = true;
          }
          if (preview) {
            previews.delete(event.id);
            const matched = full.startsWith(preview.post.sent);
            if (matched) {
              advance(preview, event);
            }
            await preview.post.finish();
            if (!matched && hasText) {
              await thread.post(full);
            }
          } else if (hasText) {
            await thread.post(full);
          }
          break;
        }
        case "span.model_request_end": {
          const usage = event.model_usage;
          stats.modelRequests += 1;
          stats.inputTokens += usage.input_tokens;
          stats.outputTokens += usage.output_tokens;
          stats.cacheReadInputTokens += usage.cache_read_input_tokens;
          stats.cacheCreationInputTokens += usage.cache_creation_input_tokens;
          if (event.is_error) {
            await closeOpenPreviews();
          }
          break;
        }
        case "agent.tool_use": {
          if (event.name === "web_search") {
            stats.searches += 1;
          }
          if (event.name === "web_fetch") {
            stats.fetches += 1;
          }
          console.log(`[managed-agent] ${sessionId} tool: ${event.name}`);
          break;
        }
        case "session.error": {
          const { error } = event as { error?: { type?: string } };
          const errorType = error?.type ?? "unknown";
          console.warn(
            `[managed-agent] ${sessionId} session error: ${errorType}`
          );
          break;
        }
        case "session.status_idle": {
          const stop = event.stop_reason;
          if (!stop) {
            break;
          }
          if (stop.type === "end_turn") {
            return { finished: true, replied };
          }
          await closeOpenPreviews();
          if (stop.type === "requires_action") {
            await thread.post(
              "The agent asked for an approval this bot can't handle. Start a new Slack thread and restore the agent's always-allow tool policy."
            );
            return { finished: false, replied };
          }
          await thread.post(
            `Research run stopped early (${stop.type}). Please try again.`
          );
          return { finished: false, replied };
        }
        case "session.status_terminated":
        case "session.deleted":
          await closeOpenPreviews();
          await thread.post(SESSION_ENDED);
          return { finished: false, replied };
        default:
          break;
      }
    }
  } finally {
    await closeOpenPreviews();
  }

  throw new StreamDropped();
}
