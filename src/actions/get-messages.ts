import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeMessage } from "../lib/normalize.js";

export const getMessagesSchema = z.object({
  conversation_id: z.number().int(),
  cursor: z.string().optional(),
});

export type GetMessagesParams = z.infer<typeof getMessagesSchema>;

export async function getMessages(
  client: KanboxClient,
  params: GetMessagesParams,
) {
  const queryParams: Record<string, unknown> = {};
  if (params.cursor) queryParams.cursor = params.cursor;

  const { data } = await client.get<{
    messages: unknown[];
    has_more: boolean;
    next_cursor: string | null;
    participant_name: string | null;
    participant_id: string | null;
  }>(`/public/${params.conversation_id}/messages`, queryParams);

  return {
    conversation_id: String(params.conversation_id),
    participant_name: data.participant_name ?? "Unknown",
    participant_linkedin_id: data.participant_id ?? null,
    messages: (data.messages ?? []).map(normalizeMessage),
    has_more: data.has_more ?? false,
    next_cursor: data.next_cursor ?? null,
  };
}
