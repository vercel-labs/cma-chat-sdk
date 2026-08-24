/** @jsxImportSource chat */

import type { PostableCard } from "chat";
import { Actions, Card, LinkButton, Table, toCardElement } from "chat";

// Types
export interface TurnStats {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  fetches: number;
  inputTokens: number;
  modelRequests: number;
  outputTokens: number;
  searches: number;
  seconds: number;
  sessionId: string;
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function consoleTraceUrl(sessionId: string): string {
  return `https://platform.claude.com/workspaces/default/sessions/${sessionId}`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

/**
 * Builds the per-turn diagnostics card used when Debug Mode is enabled.
 *
 * @param stats - Aggregated model, cache, tool, and timing metrics for one turn.
 * @returns A portable Chat SDK card with a Slack-native diagnostics table.
 * @throws Error if the JSX tree cannot be converted into a card element.
 */
export function debugCard(stats: TurnStats): PostableCard {
  const card = toCardElement(
    <Card>
      <Table
        align={["left", "right", "left", "right"]}
        caption="Claude Turn Diagnostics"
        headers={["Metric", "Value", "Metric", "Value"]}
        pageSize={4}
        rows={[
          [
            "Duration",
            formatDuration(stats.seconds),
            "Model requests",
            NUMBER_FORMAT.format(stats.modelRequests),
          ],
          [
            "Input tokens",
            NUMBER_FORMAT.format(stats.inputTokens),
            "Output tokens",
            NUMBER_FORMAT.format(stats.outputTokens),
          ],
          [
            "Cache read",
            NUMBER_FORMAT.format(stats.cacheReadInputTokens),
            "Cache creation",
            NUMBER_FORMAT.format(stats.cacheCreationInputTokens),
          ],
          [
            "Search requests",
            NUMBER_FORMAT.format(stats.searches),
            "Fetch requests",
            NUMBER_FORMAT.format(stats.fetches),
          ],
        ]}
      />
      <Actions>
        <LinkButton
          label="View Claude Console session"
          url={consoleTraceUrl(stats.sessionId)}
        />
      </Actions>
    </Card>
  );

  if (!card) {
    throw new Error("debugCard JSX did not produce a card element");
  }

  return {
    card,
    fallbackText: `Claude Turn Diagnostics · ${formatDuration(stats.seconds)} · ${NUMBER_FORMAT.format(stats.inputTokens)} input tokens · ${NUMBER_FORMAT.format(stats.outputTokens)} output tokens`,
  };
}
