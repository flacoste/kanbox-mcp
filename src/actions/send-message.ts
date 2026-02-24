import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const sendMessageSchema = z.object({
  recipient_linkedin_id: z.string(),
  message: z.string(),
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
