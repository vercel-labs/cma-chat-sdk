import type { Message, Thread } from "chat";
import {
  createManagedSession,
  enqueueTurn,
  ownedSession,
  runTurn,
} from "./managed-agents";

// Types
export interface ThreadState {
  sessionId?: string;
}

/**
 * Applies participant policy, resolves session state, and runs one user turn.
 *
 * @param thread - Chat SDK thread receiving the message.
 * @param message - Normalized inbound chat message.
 * @param mode - Routing mode for this handler invocation.
 */
export async function handleResearchMessage(
  thread: Thread<ThreadState>,
  message: Message,
  mode: "new-mention" | "subscribed" | "direct"
) {
  const text = message.text.trim();
  if (!text || message.author.isMe || message.author.isBot === true) {
    return;
  }

  if (mode === "subscribed" && !message.isMention) {
    const participants = await thread.getParticipants();
    if (participants.length !== 1) {
      await thread.unsubscribe();
      return;
    }
  }

  await thread.startTyping();

  await enqueueTurn(thread.id, async () => {
    try {
      const state = await thread.state;
      let sessionId = state?.sessionId;
      let session = sessionId ? await ownedSession(sessionId) : null;

      if (!session) {
        const lostContext = Boolean(sessionId) || mode === "subscribed";
        sessionId = await createManagedSession({
          threadId: thread.id,
          title: text,
        });
        await thread.setState({ sessionId }, { replace: true });
        session = await ownedSession(sessionId);
        if (!session) {
          throw new Error("New session failed ownership validation");
        }
        if (lostContext) {
          await thread.post(
            "Earlier research context for this thread is no longer available, so I'm starting a fresh session."
          );
        }
      }

      if (!sessionId) {
        throw new Error("Session ID was not resolved");
      }
      await runTurn(thread, sessionId, text);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "unknown";
      console.error(`[managed-agent] failed to start turn (${errorName})`);
      await thread
        .post("I couldn't start a research session. Please try again shortly.")
        .catch(() => undefined);
    }
  });
}
