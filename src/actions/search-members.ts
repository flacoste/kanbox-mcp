import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeMember } from "../lib/normalize.js";

export const searchMembersSchema = z.object({
  q: z.string().optional(),
  type: z.enum(["inbox", "unread_inbox", "connections"]).optional(),
  pipeline_name: z.string().optional(),
  step_title: z.string().optional(),
  linkedin_public_ids: z.array(z.string()).optional(),
  updated_since: z.string().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});

export type SearchMembersParams = z.infer<typeof searchMembersSchema>;

export async function searchMembers(
  client: KanboxClient,
  params: SearchMembersParams,
) {
  const { data } = await client.get<{ items: unknown[]; count: number }>(
    "/public/members",
    params as Record<string, unknown>,
  );

  return {
    items: (data.items ?? []).map(normalizeMember),
    count: data.count ?? 0,
  };
}
