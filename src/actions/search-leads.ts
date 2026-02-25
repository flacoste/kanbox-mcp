import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeLead } from "../lib/normalize.js";

export const searchLeadsSchema = z.object({
  name: z.string().describe("Filter by list name").optional(),
  q: z.string().describe("Search query for leads").optional(),
  limit: z.number().int().min(1).max(100).describe("Max results to return (1-100)").optional(),
  offset: z.number().int().min(0).describe("Number of results to skip (0+)").optional(),
});

export type SearchLeadsParams = z.infer<typeof searchLeadsSchema>;

export async function searchLeads(
  client: KanboxClient,
  params: SearchLeadsParams,
) {
  const { data } = await client.get<{ items: unknown[]; count: number }>(
    "/public/leads",
    params as Record<string, unknown>,
  );

  return {
    items: ((data.items ?? []) as Record<string, unknown>[]).map(normalizeLead),
    count: data.count ?? 0,
  };
}
