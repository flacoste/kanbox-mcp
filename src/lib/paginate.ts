const DEFAULT_PAGE_SIZE = 100;

export async function paginateOffset<T>(
  fetchPage: (
    limit: number,
    offset: number,
  ) => Promise<{ items: T[]; count: number }>,
  options?: { limit?: number },
): Promise<T[]> {
  const limit = options?.limit;
  const pageSize = limit !== undefined ? Math.min(limit, DEFAULT_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const all: T[] = [];
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { items, count } = await fetchPage(pageSize, offset);

    all.push(...items);

    // Infinite-loop guard: stop if page returned 0 items
    if (items.length === 0) break;

    offset += items.length;

    // Stop when we've fetched everything the server has
    if (offset >= count) break;

    // Stop when we've reached the caller's limit
    if (limit !== undefined && all.length >= limit) break;
  }

  if (limit !== undefined && all.length > limit) {
    return all.slice(0, limit);
  }
  return all;
}

export async function paginateCursor<T>(
  fetchPage: (
    cursor?: string,
  ) => Promise<{ items: T[]; hasMore: boolean; nextCursor: string | null }>,
  options?: { limit?: number },
): Promise<T[]> {
  const limit = options?.limit;
  const all: T[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { items, hasMore, nextCursor } = await fetchPage(cursor);

    all.push(...items);

    // Stop when there are no more pages
    if (!hasMore) break;

    // Stop when we've reached the caller's limit
    if (limit !== undefined && all.length >= limit) break;

    cursor = nextCursor ?? undefined;
  }

  if (limit !== undefined && all.length > limit) {
    return all.slice(0, limit);
  }
  return all;
}
