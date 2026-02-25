import { z } from "zod";
import { type KanboxClient } from "../lib/kanbox-client.js";
import { normalizeList } from "../lib/normalize.js";

export const listListsSchema = z.object({
  limit: z.number().int().min(1).max(100).describe("Max results to return (1-100)").optional(),
  offset: z.number().int().min(0).describe("Number of results to skip (0+)").optional(),
});

export type ListListsParams = z.infer<typeof listListsSchema>;

export async function listLists(
  client: KanboxClient,
  params: ListListsParams,
) {
  const { data } = await client.get<{ items: unknown[]; count: number }>(
    "/public/lists",
    params as Record<string, unknown>,
  );

  return {
    items: ((data.items ?? []) as Record<string, unknown>[]).map(normalizeList),
    count: data.count ?? 0,
  };
}
