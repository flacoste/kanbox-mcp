import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeMember } from "../lib/normalize.js";

export const searchMembersSchema = z.object({
  q: z.string().describe("Fuzzy name search — a single distinctive term like a last name works best").optional(),
  type: z.enum(["inbox", "unread_inbox", "connections"]).describe("Filter by member type").optional(),
  pipeline_name: z.string().describe("Filter by pipeline name").optional(),
  step_title: z.string().describe("Filter by pipeline step title").optional(),
  linkedin_public_ids: z.array(z.string()).describe("Array of public profile slugs for exact lookup").optional(),
  updated_since: z.string().describe("ISO 8601 timestamp to filter by update date").optional(),
  limit: z.number().int().min(1).max(100).describe("Max results to return (1-100)").optional(),
  offset: z.number().int().min(0).describe("Number of results to skip (0+)").optional(),
  include_history: z
    .boolean()
    .describe(
      "Include LinkedIn position history (past_positions, years_of_experience, position dates). Default false — off keeps output compact.",
    )
    .optional(),
});

export type SearchMembersParams = z.infer<typeof searchMembersSchema>;

export async function searchMembers(
  client: KanboxClient,
  params: SearchMembersParams,
) {
  const { include_history, ...query } = params;
  const { data } = await client.get<{ items: unknown[]; count: number }>(
    "/public/members",
    query as Record<string, unknown>,
  );

  return {
    items: ((data.items ?? []) as Record<string, unknown>[]).map((m) =>
      normalizeMember(m, include_history ?? false),
    ),
    count: data.count ?? 0,
  };
}
