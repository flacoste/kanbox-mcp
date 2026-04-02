#!/usr/bin/env node

import { parseArgs } from "node:util";
import { KanboxClient } from "./lib/kanbox-client.js";
import { searchMembers, searchMembersSchema } from "./actions/search-members.js";
import { searchLeads, searchLeadsSchema } from "./actions/search-leads.js";
import { getMessages, getMessagesSchema } from "./actions/get-messages.js";
import { listLists, listListsSchema } from "./actions/list-lists.js";
import { paginateOffset, paginateCursor } from "./lib/paginate.js";

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

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }
  return n;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

async function handleSearchMembers(client: KanboxClient, commandArgs: string[]): Promise<void> {
  const { values } = parseArgs({
    args: commandArgs,
    options: {
      q: { type: "string" },
      "linkedin-public-ids": { type: "string" },
      type: { type: "string" },
      "pipeline-name": { type: "string" },
      "step-title": { type: "string" },
      "updated-since": { type: "string" },
      limit: { type: "string" },
    },
    strict: false,
  });

  const limit = parseLimit(values.limit);
  const params = searchMembersSchema.parse(stripUndefined({
    q: values.q,
    linkedin_public_ids: values["linkedin-public-ids"]?.split(","),
    type: values.type,
    pipeline_name: values["pipeline-name"],
    step_title: values["step-title"],
    updated_since: values["updated-since"],
  }));

  const items = await paginateOffset(
    (pageLimit, offset) => searchMembers(client, { ...params, limit: pageLimit, offset }),
    { limit },
  );
  process.stdout.write(JSON.stringify(items));
}

async function handleGetMessages(client: KanboxClient, commandArgs: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: commandArgs,
    options: {
      limit: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (positionals.length === 0) {
    console.error("Error: conversation_id is required");
    process.exit(1);
  }

  const conversationId = parseInt(positionals[0], 10);
  if (Number.isNaN(conversationId)) {
    console.error("Error: conversation_id must be a number");
    process.exit(1);
  }

  const limit = parseLimit(values.limit);
  const validatedParams = getMessagesSchema.parse({ conversation_id: conversationId });

  // Capture metadata from first page
  let metadata: { conversation_id: string; participant_name: string; participant_linkedin_id: string | null } | null = null;

  const messages = await paginateCursor(
    async (cursor?: string) => {
      const result = await getMessages(client, { ...validatedParams, cursor });
      if (!metadata) {
        metadata = {
          conversation_id: result.conversation_id,
          participant_name: result.participant_name,
          participant_linkedin_id: result.participant_linkedin_id,
        };
      }
      return {
        items: result.messages,
        hasMore: result.has_more,
        nextCursor: result.next_cursor,
      };
    },
    { limit },
  );

  process.stdout.write(JSON.stringify({
    ...metadata,
    messages,
  }));
}

async function handleSearchLeads(client: KanboxClient, commandArgs: string[]): Promise<void> {
  const { values } = parseArgs({
    args: commandArgs,
    options: {
      q: { type: "string" },
      name: { type: "string" },
      limit: { type: "string" },
    },
    strict: false,
  });

  const limit = parseLimit(values.limit);
  const params = searchLeadsSchema.parse(stripUndefined({
    q: values.q,
    name: values.name,
  }));

  const items = await paginateOffset(
    (pageLimit, offset) => searchLeads(client, { ...params, limit: pageLimit, offset }),
    { limit },
  );
  process.stdout.write(JSON.stringify(items));
}

async function handleListLists(client: KanboxClient, commandArgs: string[]): Promise<void> {
  const { values } = parseArgs({
    args: commandArgs,
    options: {
      limit: { type: "string" },
    },
    strict: false,
  });

  const limit = parseLimit(values.limit);
  const params = listListsSchema.parse({});

  const items = await paginateOffset(
    (pageLimit, offset) => listLists(client, { ...params, limit: pageLimit, offset }),
    { limit },
  );
  process.stdout.write(JSON.stringify(items));
}

export async function run(argv: string[]): Promise<void> {
  // Handle top-level --help or no arguments before token check
  if (argv.length === 0 || (argv.includes("--help") && !argv.some(a => isCommand(a)))) {
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

  const baseUrl = process.env.KANBOX_BASE_URL;
  const client = new KanboxClient({ apiToken, ...(baseUrl ? { baseUrl } : {}) });
  const commandArgs = argv.slice(1);

  try {
    switch (command) {
      case "search-members":
        await handleSearchMembers(client, commandArgs);
        break;
      case "get-messages":
        await handleGetMessages(client, commandArgs);
        break;
      case "search-leads":
        await handleSearchLeads(client, commandArgs);
        break;
      case "list-lists":
        await handleListLists(client, commandArgs);
        break;
    }
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      console.error(`API error (${err.status}): ${err.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

// Run when executed directly (not when imported by tests)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.ts") || process.argv[1].endsWith("/cli.js"));

if (isDirectExecution) {
  run(process.argv.slice(2));
}
