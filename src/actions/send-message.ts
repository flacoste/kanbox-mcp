import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const sendMessageSchema = z.object({
  recipient_linkedin_id: z.string().describe("Internal LinkedIn ID (ACoAAA… format) from search_members linkedin_id field"),
  message: z.string().max(8000).describe("Message text to send (max 8000 chars)"),
});

export type SendMessageParams = z.infer<typeof sendMessageSchema>;

export async function sendMessage(
  client: KanboxClient,
  params: SendMessageParams,
) {
  const { status } = await client.post("/public/messages", params);

  return {
    success: true,
    status,
    recipient_linkedin_id: params.recipient_linkedin_id,
    note:
      status === 202
        ? "Message accepted for delivery."
        : undefined,
  };
}
