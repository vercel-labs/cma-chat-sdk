import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILES = [".env", ".env.local"] as const;
const LINE_BREAK = /\r?\n/;
const TRAILING_NEWLINE = /\n$/;

function localEnvFile(): string {
  return ENV_FILES.find((file) => existsSync(file)) ?? ".env.local";
}

/**
 * Loads local CLI variables from `.env`, falling back to `.env.local`.
 *
 * @returns The loaded file path, or `null` when neither file exists.
 * @remarks Existing process environment variables retain precedence.
 */
export function loadLocalEnv(): string | null {
  const envFile = localEnvFile();
  if (!existsSync(envFile)) {
    console.warn("No .env or .env.local file found. Continuing without one.");
    return null;
  }

  process.loadEnvFile(envFile);
  return envFile;
}

/**
 * Upserts environment variables in the active local env file.
 *
 * @param values - Name/value pairs to persist.
 * @returns The updated file path.
 * @throws Error when the file cannot be read or written.
 * @remarks Creates `.env.local` with owner-only permissions when no env file
 * exists.
 */
export function saveLocalEnv(values: Record<string, string>): string {
  const envFile = localEnvFile();
  const existing = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const lines = existing
    ? existing.replace(TRAILING_NEWLINE, "").split(LINE_BREAK)
    : [];

  for (const [name, value] of Object.entries(values)) {
    const assignment = `${name}=${value}`;
    const index = lines.findIndex((line) => {
      const normalized = line.startsWith("export ")
        ? line.slice("export ".length)
        : line;
      const separator = normalized.indexOf("=");
      return separator !== -1 && normalized.slice(0, separator).trim() === name;
    });
    if (index === -1) {
      lines.push(assignment);
    } else {
      lines[index] = assignment;
    }
  }

  writeFileSync(envFile, `${lines.join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return envFile;
}
