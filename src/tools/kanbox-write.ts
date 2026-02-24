import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { formatError, formatResult } from "../lib/errors.js";
import { updateMember, updateMemberSchema } from "../actions/update-member.js";
import { sendMessage, sendMessageSchema } from "../actions/send-message.js";
import { sendConnection, sendConnectionSchema } from "../actions/send-connection.js";
import { addLead, addLeadSchema } from "../actions/add-lead.js";
import { addLeadUrl, addLeadUrlSchema } from "../actions/add-lead-url.js";

const DESCRIPTION = `Write LinkedIn contact data to Kanbox CRM. All writes are async (202 Accepted).

Actions:
- update_member: Update member fields. Params: id (integer), email, phone, labels (string array — FULL REPLACEMENT, read existing first), pipeline, step, custom, icebreaker.
- send_message: Send LinkedIn message. Params: recipient_linkedin_id, message.
- send_connection: Send connection request. Params: recipient_linkedin_id, message (optional, max 300 chars).
- add_lead: Add structured lead to a pre-existing list. Params: list (name), linkedin_public_id, firstname, lastname, plus optional email/phone/company/location/job/icebreaker/labels/pipeline/step. Partial enrichment only.
- add_lead_url: Add lead by LinkedIn URL for full enrichment (takes minutes). Params: linkedin_profile_url, list (name). Poll list_lists for is_processing status.`;

export function registerWriteTool(server: McpServer, client: KanboxClient) {
  server.tool(
    "kanbox_write",
    DESCRIPTION,
    {
      action: z.enum(["update_member", "send_message", "send_connection", "add_lead", "add_lead_url"]),
      params: z.record(z.unknown()).optional(),
    },
    async ({ action, params }) => {
      try {
        const p = params ?? {};

        switch (action) {
          case "update_member":
            return formatResult(await updateMember(client, updateMemberSchema.parse(p)));

          case "send_message":
            return formatResult(await sendMessage(client, sendMessageSchema.parse(p)));

          case "send_connection":
            return formatResult(await sendConnection(client, sendConnectionSchema.parse(p)));

          case "add_lead":
            return formatResult(await addLead(client, addLeadSchema.parse(p)));

          case "add_lead_url":
            return formatResult(await addLeadUrl(client, addLeadUrlSchema.parse(p)));

          default:
            return formatError(new Error(`Unknown action: ${action}`));
        }
      } catch (error) {
        return formatError(error);
      }
    },
  );
}
