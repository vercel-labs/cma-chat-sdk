// Types
type Command = "archive" | "setup" | "update";

const COMMAND_MODULES: Record<Command, string> = {
  archive: "./archive.ts",
  setup: "./setup.ts",
  update: "./update.ts",
};

function isCommand(value: string | undefined): value is Command {
  return Boolean(value && value in COMMAND_MODULES);
}

const [, , command] = process.argv;
if (!isCommand(command)) {
  console.error("Expected one of: setup, update, archive");
  process.exit(1);
}

await import(COMMAND_MODULES[command]);

export {};
