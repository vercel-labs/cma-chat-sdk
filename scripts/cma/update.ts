import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_DESCRIPTION,
  AGENT_NAME,
  agentTools,
  MODEL,
  SYSTEM_PROMPT,
} from "./lib/agent";

const agentId = process.env.CLAUDE_AGENT_ID;
if (!agentId || agentId.endsWith("...")) {
  console.error(
    "CLAUDE_AGENT_ID is not set. Run `npm run cma:setup` once and add the printed ID to your environment."
  );
  process.exit(1);
}

const client = new Anthropic();
const current = await client.beta.agents.retrieve(agentId);
const agent = await client.beta.agents.update(agentId, {
  description: AGENT_DESCRIPTION,
  model: MODEL,
  name: AGENT_NAME,
  system: SYSTEM_PROMPT,
  tools: agentTools(),
  version: current.version,
});

console.log(
  `${agent.name}: version ${current.version} -> ${agent.version} (${MODEL})`
);
