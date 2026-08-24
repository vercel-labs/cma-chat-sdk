import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_DESCRIPTION,
  AGENT_NAME,
  agentTools,
  MODEL,
  SYSTEM_PROMPT,
} from "./lib/agent";
import { saveLocalEnv } from "./lib/env";

const syncToVercel = process.argv.includes("--vercel");

function addVercelEnv(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "vercel",
      ["env", "add", name, "--value", value, "--yes", "--force"],
      { stdio: "inherit" }
    );

    child.once("error", (error) => {
      reject(
        new Error(
          `Could not run the Vercel CLI for ${name}. Install it and run \`vercel link\` first.`,
          { cause: error }
        )
      );
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Vercel CLI exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

async function syncVercelIds(agentId: string, environmentId: string) {
  console.log("Adding Managed Agents IDs to the linked Vercel project...");
  await addVercelEnv("CLAUDE_AGENT_ID", agentId);
  await addVercelEnv("CLAUDE_ENVIRONMENT_ID", environmentId);
  console.log("Added both values to all Vercel environments.");
}

function saveManagedAgentIds(agentId: string, environmentId: string) {
  const envFile = saveLocalEnv({
    CLAUDE_AGENT_ID: agentId,
    CLAUDE_ENVIRONMENT_ID: environmentId,
  });
  console.log(`Saved both values to ${envFile}.`);
}

function configuredId(name: string): string | null {
  const value = process.env[name];
  return value && !value.endsWith("...") ? value : null;
}

const existingAgentId = configuredId("CLAUDE_AGENT_ID");
const existingEnvironmentId = configuredId("CLAUDE_ENVIRONMENT_ID");

if (existingAgentId || existingEnvironmentId) {
  if (syncToVercel && existingAgentId && existingEnvironmentId) {
    saveManagedAgentIds(existingAgentId, existingEnvironmentId);
    await syncVercelIds(existingAgentId, existingEnvironmentId);
    process.exit(0);
  }

  console.error(
    "Managed Agents IDs are already set. Run `npm run cma:update` for configuration changes. " +
      "To copy both existing IDs to Vercel, run `npm run cma:setup -- --vercel`."
  );
  process.exit(1);
}

const client = new Anthropic();
const metadata = { template: "claude-slack-research-analyst" };

const environment = await client.beta.environments.create({
  config: {
    networking: { type: "unrestricted" },
    type: "cloud",
  },
  metadata,
  name: "claude-slack-research-analyst-env",
});
console.log(`environment: ${environment.id}`);

const agent = await client.beta.agents.create({
  description: AGENT_DESCRIPTION,
  metadata,
  model: MODEL,
  name: AGENT_NAME,
  system: SYSTEM_PROMPT,
  tools: agentTools(),
});
console.log(`analyst: ${agent.id} (version ${agent.version}, ${MODEL})`);

console.log("\nCreated Managed Agents resources:");
console.log(`CLAUDE_AGENT_ID=${agent.id}`);
console.log(`CLAUDE_ENVIRONMENT_ID=${environment.id}`);
saveManagedAgentIds(agent.id, environment.id);

if (syncToVercel) {
  console.log();
  await syncVercelIds(agent.id, environment.id);
}
