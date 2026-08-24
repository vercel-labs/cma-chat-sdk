import Anthropic from "@anthropic-ai/sdk";
import { loadLocalEnv } from "./lib/env";

loadLocalEnv();

function requiredId(name: "CLAUDE_AGENT_ID" | "CLAUDE_ENVIRONMENT_ID") {
  const value = process.env[name];
  if (!value || value.endsWith("...")) {
    throw new Error(`${name} must be set before archiving resources`);
  }
  return value;
}

const agentId = requiredId("CLAUDE_AGENT_ID");
const environmentId = requiredId("CLAUDE_ENVIRONMENT_ID");
const client = new Anthropic();

await client.beta.agents.archive(agentId);
console.log(`Archived agent ${agentId}`);

await client.beta.environments.archive(environmentId);
console.log(`Archived environment ${environmentId}`);
