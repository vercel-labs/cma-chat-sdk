# Claude Managed Agents research analyst

[Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) and [Chat SDK](https://chat-sdk.dev) power this Slack research bot. Mention it in a channel or send it a DM, and it will search and fetch sources in an Anthropic-managed sandbox before streaming a brief back into the thread.

Each Slack thread maps to one persistent Managed Agents session, so follow-ups retain the thread's prior research context. Vercel Connect owns the Slack app and credentials, while Redis preserves subscriptions, session mappings, and webhook deduplication across deployments.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fcma-chat-sdk&project-name=claude-research-analyst&repository-name=claude-research-analyst&env=ANTHROPIC_API_KEY%2CCLAUDE_AGENT_ID%2CCLAUDE_ENVIRONMENT_ID&envDescription=Get+your+API+key%2C+agent+ID%2C+and+environment+ID+from+the+Claude+Console.&envLink=https%3A%2F%2Fplatform.claude.com%2Fdashboard&connect=%5B%7B%22type%22%3A%22slack%22%2C%22env%22%3A%22SLACK_CONNECTOR%22%2C%22triggers%22%3Atrue%2C%22triggerPath%22%3A%22%2Fapi%2Fwebhooks%2Fslack%22%7D%5D&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%2C%22protocol%22%3A%22storage%22%2C%22allowConnectExistingProduct%22%3Atrue%7D%5D&demo-title=Claude+Research+Analyst+for+Slack&demo-description=A+Slack+research+analyst+powered+by+Claude+Managed+Agents%2C+Chat+SDK%2C+Redis%2C+and+Vercel+Connect.)

## Stack

| Layer | Choice |
| --- | --- |
| Surface | Slack via [Chat SDK](https://chat-sdk.dev) and [Vercel Connect](https://vercel.com/connect) |
| Agent | [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) with Claude Sonnet 5 |
| State | [Upstash Redis](https://vercel.com/marketplace/upstash) |
| Runtime | Next.js 16 on Vercel |

## Quickstart

Requires Node.js 24+, an [Anthropic API key](https://platform.claude.com/settings/workspaces/default/keys) with Managed Agents access, Vercel project, and Redis.

### 1. Clone and install

```bash
git clone https://github.com/vercel-labs/claude-research-bot
cd claude-research-bot
pnpm install
```

### 2. Connect Slack and Redis

**Add Slack with Vercel Connect:**

```bash
vercel link
vercel connect create slack --name claude-research-bot --triggers
vercel connect attach slack/claude-research-bot \
  --project YOUR_VERCEL_PROJECT \
  --environment production \
  --triggers \
  --trigger-path /api/webhooks/slack
```

**Add Upstash Redis from the Vercel Marketplace:**

```bash
vercel integration add upstash/upstash-kv
```

### 3. Create the Managed Agent

Add `ANTHROPIC_API_KEY` to `.env.local`, then run:

```bash
npm run cma:setup -- --vercel
```

This one-time command creates the agent and sandbox environment, writes both IDs to `.env.local`, and adds them to the linked Vercel project.

### 4. Deploy

```bash
vercel env add ANTHROPIC_API_KEY
vercel deploy --prod
```

Invite the bot to the Slack channels where it should answer or message the bot directly.

In a thread with one human participant, follow-ups do not need another @mention. Once multiple humans participate, the bot responds only when explicitly mentioned.

## Environment variables

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | None | Authenticates Claude Managed Agents |
| `CLAUDE_AGENT_ID` | Yes | None | Persistent analyst created by `npm run cma:setup` |
| `CLAUDE_ENVIRONMENT_ID` | Yes | None | Anthropic-managed sandbox created by setup |
| `REDIS_URL` | Yes | None | Stores subscriptions, deduplication, and thread/session mappings |
| `SLACK_CONNECTOR` | Yes | None | Vercel Connect Slack connector UID |
| `BOT_USERNAME` | No | `claude-research-bot` | Chat SDK bot name |
| `CLAUDE_DEBUG_MODE` | No | `false` | Posts per-turn diagnostics and a Claude Console link |

## Customize the analyst

The model and system prompt live in [`scripts/cma/lib/agent.ts`](scripts/cma/lib/agent.ts).

Publish changes as a new agent version:

```bash
npm run cma:update
```

Anthropic pins each session to the agent version that created it, so test changes in a new Slack thread. Use `npm run cma:update` for prompt changes, not `npm run cma:setup`.

The setup disables Bash because the analyst reads untrusted web pages. If Bash were auto-approved with open network access, a malicious page could trick it into sending conversation data to an attacker.

## Debug mode

Set `CLAUDE_DEBUG_MODE=true` to post a compact diagnostics table after every completed turn. It includes duration, model requests, token and prompt-cache usage, web searches and fetches, and a Claude Console session link.

## Key files

| File | Purpose |
| --- | --- |
| `src/lib/bot.ts` | Chat SDK configuration and Slack handler registration |
| `src/lib/research-handler.ts` | Participant policy and thread/session orchestration |
| `src/lib/managed-agents.ts` | Session validation, turn queue, event stream, and token previews |
| `src/lib/config.ts` | Typed runtime configuration and required env validation |
| `src/lib/debug-card.tsx` | Debug Mode diagnostics card |
| `src/app/api/webhooks/[platform]/route.ts` | Fast webhook acknowledgement and background dispatch |
| `scripts/cma/cli.ts` | Dispatches setup, update, and archive commands |
| `scripts/cma/lib/agent.ts` | Model, system prompt, and tool posture |
| `scripts/cma/setup.ts` | One-time agent and environment provisioning |
| `scripts/cma/update.ts` | Publishes a new agent version |
| `scripts/cma/archive.ts` | Archives Managed Agents resources |
| `scripts/cma/lib/env.ts` | Shared local environment loading and persistence |

## Cleanup

Archive the persistent Anthropic resources when finished:

```bash
npm run cma:archive
```

Because archiving is permanent, confirm both Managed Agents IDs before running the command.

## References

- [Claude Managed Agents × Chat SDK guide](https://vercel.com/kb/guide/claude-managed-agents-chat-sdk)
- [Claude Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Claude Managed Agents events and streaming](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Chat SDK docs](https://chat-sdk.dev/docs)
- [Slack adapter](https://chat-sdk.dev/adapters/official/slack)
- [Vercel Connect](https://vercel.com/docs/connect)
