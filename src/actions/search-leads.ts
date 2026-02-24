import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeLead } from "../lib/normalize.js";

export const searchLeadsSchema = z.object({
  name: z.string().optional(),
  q: z.string().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
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
    items: (data.items ?? []).map(normalizeLead),
    count: data.count ?? 0,
  };
}
