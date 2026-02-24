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
    items: unknown[];
    has_more: boolean;
    next_cursor: string | null;
    user: { firstname: string; lastname: string; linkedin_id: string } | null;
  }>(`/public/${params.conversation_id}/messages`, queryParams);

  const participant = data.user;
  const participantName = participant
    ? [participant.firstname, participant.lastname].filter(Boolean).join(" ")
    : "Unknown";

  return {
    conversation_id: String(params.conversation_id),
    participant_name: participantName,
    participant_linkedin_id: participant?.linkedin_id ?? null,
    messages: (data.items ?? []).map(normalizeMessage),
    has_more: data.has_more ?? false,
    next_cursor: data.next_cursor ?? null,
  };
}
