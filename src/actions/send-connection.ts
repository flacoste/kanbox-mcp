import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const sendConnectionSchema = z.object({
  recipient_linkedin_id: z.string().describe("Internal LinkedIn ID (ACoAAA… format) from search_members linkedin_id field"),
  message: z.string().max(300).describe("Connection request message (max 300 chars, LinkedIn limit)").optional(),
});

export type SendConnectionParams = z.infer<typeof sendConnectionSchema>;

export async function sendConnection(
  client: KanboxClient,
  params: SendConnectionParams,
) {
  const { status } = await client.post("/public/connections", params);

  return {
    success: true,
    status,
    recipient_linkedin_id: params.recipient_linkedin_id,
    note:
      status === 202
        ? "Connection request accepted for delivery."
        : undefined,
  };
}
