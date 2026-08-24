# Coding agent guidance

This project runs a Slack research bot on Next.js, Chat SDK, Redis, Vercel Connect, and Claude Managed Agents. The bot acknowledges research requests, streams briefs with sources, and keeps one Managed Agents session per Slack thread.

## Commands

```bash
pnpm dev                  # Next.js development server
pnpm validate             # Lint, type-check, Knip, and production build
npm run cma:setup         # Create the persistent agent and environment once
npm run cma:setup -- --vercel # Also sync generated IDs to Vercel
npm run cma:update        # Publish model, prompt, or tool-policy changes
npm run cma:archive       # Permanently archive CMA resources
```

Node.js 24 or newer is required. `ANTHROPIC_API_KEY`, `CLAUDE_AGENT_ID`, `CLAUDE_ENVIRONMENT_ID`, `REDIS_URL`, and `SLACK_CONNECTOR` are required at runtime.

## Project map

```text
src/
  app/api/webhooks/[platform]/route.ts  Slack webhook dispatch via after()
  lib/bot.ts                            Chat SDK, Slack, Redis, handlers
  lib/research-handler.ts               Participant and thread/session policy
  lib/managed-agents.ts                 CMA event-stream bridge
  lib/debug-card.tsx                    Optional per-turn diagnostics
  lib/config.ts                         Validated runtime environment
scripts/cma/
  cli.ts                                CMA command dispatcher
  setup.ts / update.ts / archive.ts     Persistent resource operations
  lib/agent.ts                          Model, prompt, and tool posture
  lib/env.ts                            Local env loading and persistence
```

## Runtime invariants

- Keep Vercel Connect. Do not introduce `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET`.
- Redis is required for webhook deduplication, subscriptions, and thread state. Do not use memory state.
- Persist the Managed Agents session ID with `thread.setState()`. Validate stored IDs with `ownedSession()` before use.
- Open the Anthropic event stream before sending the user event. It only emits events produced after attachment.
- Treat buffered `agent.message` events as authoritative. Token previews are best-effort prefixes.
- Concatenate adjacent text blocks without separators. Citation metadata can split one sentence across blocks.
- Preserve the server-side user-message anchor that discards events left over from a previous turn.
- `enqueueTurn` is process-local. Do not describe it as a distributed lock.
- The webhook route already uses `after()` and `maxDuration = 300`. Do not add separate Slack acknowledgement logic.
- Never log message content or tool inputs. Log event types, tool names, session IDs, and sanitized error types only.

## Agent and tool safety

- The agent uses `agent_toolset_20260401` with `always_allow`. Bash stays disabled.
- The bot reads untrusted web pages. Do not enable Bash without a real human-approval flow and restricted egress.
- Agent and environment resources are persistent. Never create them in a request path or during build.
- Edit `scripts/cma/lib/agent.ts`, run `npm run cma:update`, then test in a new Slack thread. Existing sessions stay pinned to their original agent version.

## Chat behavior

- A new channel mention subscribes the bot to that thread.
- In a one-human thread, follow-ups do not need another mention.
- Once multiple humans participate, the bot ignores unmentioned messages and unsubscribes. An explicit mention can engage it again.
- DMs always route through `onDirectMessage`.
- If Redis thread state expires, create a fresh session and explain lost context only when the prior conversation is evident.

## Code conventions

- Keep public types near the top of each file under `// Types`.
- Prefer Chat SDK's exported `Thread` and `Message` types over local structural copies.
- Add focused TSDoc to exported contracts using `@param`, `@returns`, `@throws`, and `@remarks` when applicable.
- Keep the Managed Agents event loop close to Anthropic's reference implementation. Avoid broad rewrites.
- Run `pnpm validate` after substantive changes.

## Reference docs

Read these before changing Chat SDK or Managed Agents behavior:

- `.claude/skills/chat-sdk/SKILL.md`
- `node_modules/chat/docs/`
- `node_modules/chat/dist/index.d.ts`
- `node_modules/@chat-adapter/slack/dist/index.d.ts`
- `https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/chat-sdk`
- `https://platform.claude.com/docs/en/managed-agents/`
