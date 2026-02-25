import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { formatError, formatResult } from "../lib/errors.js";
import { searchMembers, searchMembersSchema } from "../actions/search-members.js";
import { searchLeads, searchLeadsSchema } from "../actions/search-leads.js";
import { getMessages, getMessagesSchema } from "../actions/get-messages.js";
import { listLists, listListsSchema } from "../actions/list-lists.js";

const DESCRIPTION = `Read LinkedIn contact data from Kanbox CRM.

IMPORTANT: All results include a linkedin_id field (internal ID starting with "ACoAAA…"). Use this ID — not the public slug — when calling send_message or send_connection.

Actions:
- search_members: Search inbox/connections. Params: q (fuzzy name search — a single distinctive term like a last name works best, avoids false matches from common first names), type (inbox|unread_inbox|connections), pipeline_name, step_title, linkedin_public_ids (array of public profile slugs for exact lookup, e.g. ["janedoe"]), updated_since, limit, offset.
- search_leads: Search scraped leads by list name or query. Params: name (list name), q (search), limit, offset. Note: leads endpoint does NOT return linkedin_id; use search_members to get the internal ID needed for messaging/connections.
- get_messages: Get conversation messages. Params: conversation_id (integer, from search_members conversations[].id), cursor (optional, for pagination).
- list_lists: List available Kanbox lists. Params: limit, offset.`;

export function registerReadTool(server: McpServer, client: KanboxClient) {
  server.registerTool(
    "kanbox_read",
    {
      description: DESCRIPTION,
      inputSchema: {
        action: z.enum(["search_members", "search_leads", "get_messages", "list_lists"]),
        params: z.record(z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ action, params }) => {
      try {
        const p = params ?? {};

        switch (action) {
          case "search_members":
            return formatResult(await searchMembers(client, searchMembersSchema.parse(p)));

          case "search_leads":
            return formatResult(await searchLeads(client, searchLeadsSchema.parse(p)));

          case "get_messages":
            return formatResult(await getMessages(client, getMessagesSchema.parse(p)));

          case "list_lists":
            return formatResult(await listLists(client, listListsSchema.parse(p)));

          default:
            return formatError(new Error(`Unknown action: ${action}`));
        }
      } catch (error) {
        return formatError(error);
      }
    },
  );
}
