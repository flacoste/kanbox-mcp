#!/usr/bin/env node

const COMMANDS = ["search-members", "get-messages", "search-leads", "list-lists"] as const;
type Command = (typeof COMMANDS)[number];

const USAGE = `Usage: kanbox <command> [options]

Commands:
  search-members    Search inbox/connections
  get-messages      Get conversation messages
  search-leads      Search scraped leads
  list-lists        List available Kanbox lists

Options:
  --help            Show this help message

Run 'kanbox <command> --help' for command-specific options.
`;

const COMMAND_HELP: Record<Command, string> = {
  "search-members": `Usage: kanbox search-members [options]

Options:
  --q                   Fuzzy name search
  --linkedin-public-ids Comma-separated public profile slugs
  --type                Filter: inbox, unread_inbox, connections
  --pipeline-name       Filter by pipeline name
  --step-title          Filter by pipeline step title
  --updated-since       ISO 8601 timestamp filter
  --limit               Max total results to return
  --help                Show this help message
`,
  "get-messages": `Usage: kanbox get-messages <conversation_id> [options]

Arguments:
  conversation_id       Conversation ID (integer)

Options:
  --limit               Max total messages to return
  --help                Show this help message
`,
  "search-leads": `Usage: kanbox search-leads [options]

Options:
  --q                   Search query
  --name                Filter by list name
  --limit               Max total results to return
  --help                Show this help message
`,
  "list-lists": `Usage: kanbox list-lists [options]

Options:
  --limit               Max total results to return
  --help                Show this help message
`,
};

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

export async function run(argv: string[]): Promise<void> {
  // Handle top-level --help or no arguments before token check
  if (argv.length === 0 || argv.includes("--help") && !argv.some(a => isCommand(a))) {
    console.error(USAGE);
    process.exit(0);
  }

  const command = argv[0];

  // Handle command-specific --help before token check
  if (isCommand(command) && argv.includes("--help")) {
    console.error(COMMAND_HELP[command]);
    process.exit(0);
  }

  // Unknown command check
  if (!isCommand(command)) {
    console.error(`Unknown command: ${command}\n`);
    console.error(USAGE);
    process.exit(1);
  }

  // Token check — only after help and command validation
  const apiToken = process.env.KANBOX_API_TOKEN;
  if (!apiToken) {
    console.error("KANBOX_API_TOKEN environment variable is required");
    process.exit(1);
  }

  // Command stubs — will be replaced in Unit 3
  const _commandArgs = argv.slice(1);
  process.stdout.write(JSON.stringify([]));
}

// Run when executed directly (not when imported by tests)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.ts") || process.argv[1].endsWith("/cli.js"));

if (isDirectExecution) {
  run(process.argv.slice(2));
}
