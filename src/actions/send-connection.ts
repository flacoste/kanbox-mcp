import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";

export const sendConnectionSchema = z.object({
  recipient_linkedin_id: z.string(),
  message: z.string().max(300).optional(),
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
