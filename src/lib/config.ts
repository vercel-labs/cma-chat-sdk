const REQUIRED_ENVIRONMENT_VARIABLES = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_AGENT_ID",
  "CLAUDE_ENVIRONMENT_ID",
  "REDIS_URL",
  "SLACK_CONNECTOR",
] as const;

// Types
type RequiredEnvironmentVariable =
  (typeof REQUIRED_ENVIRONMENT_VARIABLES)[number];

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Runtime configuration captured when the server process starts.
 *
 * @remarks
 * Required values fail fast during module initialization so every consumer
 * receives a fully validated string.
 */
export const config = {
  agentId: requireEnv("CLAUDE_AGENT_ID"),
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  botUsername: process.env.BOT_USERNAME?.trim() || "claude-research-bot",
  debugMode: enabled(process.env.CLAUDE_DEBUG_MODE),
  environmentId: requireEnv("CLAUDE_ENVIRONMENT_ID"),
  redisUrl: requireEnv("REDIS_URL"),
  slackConnector: requireEnv("SLACK_CONNECTOR"),
} as const;

/**
 * Reads a required application environment variable.
 *
 * @param name - Environment variable to read.
 * @returns The configured, non-placeholder value.
 * @throws Error when the variable is missing or still contains a placeholder.
 */
function requireEnv(name: RequiredEnvironmentVariable): string {
  const value = process.env[name];
  if (!value || value.endsWith("...")) {
    throw new Error(`${name} must be set (see .env.example)`);
  }
  return value;
}
