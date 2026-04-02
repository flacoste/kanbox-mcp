import { describe, it, expect, vi } from "vitest";
import { paginateOffset, paginateCursor } from "../../src/lib/paginate.js";

describe("paginateOffset", () => {
  it("fetches 3 pages of 100 items (count=250), returns all 250", async () => {
    let callNum = 0;
    const fetchPage = vi.fn(async (limit: number, offset: number) => {
      callNum++;
      const remaining = 250 - offset;
      const pageSize = Math.min(limit, remaining);
      const items = Array.from({ length: pageSize }, (_, i) => offset + i);
      return { items, count: 250 };
    });

    const result = await paginateOffset(fetchPage);

    expect(result).toHaveLength(250);
    expect(result[0]).toBe(0);
    expect(result[249]).toBe(249);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenCalledWith(100, 0);
    expect(fetchPage).toHaveBeenCalledWith(100, 100);
    expect(fetchPage).toHaveBeenCalledWith(100, 200);
  });

  it("with limit=50 fetches 1 page, trims to 50", async () => {
    const fetchPage = vi.fn(async (limit: number, offset: number) => {
      const items = Array.from({ length: limit }, (_, i) => offset + i);
      return { items, count: 500 };
    });

    const result = await paginateOffset(fetchPage, { limit: 50 });

    expect(result).toHaveLength(50);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(50, 0);
  });

  it("with empty first page (count=0), returns []", async () => {
    const fetchPage = vi.fn(async () => ({
      items: [] as number[],
      count: 0,
    }));

    const result = await paginateOffset(fetchPage);

    expect(result).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("limit larger than total results, returns all without error", async () => {
    const fetchPage = vi.fn(async (limit: number, offset: number) => {
      const remaining = 30 - offset;
      const pageSize = Math.min(limit, Math.max(remaining, 0));
      const items = Array.from({ length: pageSize }, (_, i) => offset + i);
      return { items, count: 30 };
    });

    const result = await paginateOffset(fetchPage, { limit: 200 });

    expect(result).toHaveLength(30);
  });

  it("limit=1 returns exactly 1 item from first page", async () => {
    const fetchPage = vi.fn(async (limit: number, offset: number) => {
      const items = Array.from({ length: limit }, (_, i) => offset + i);
      return { items, count: 100 };
    });

    const result = await paginateOffset(fetchPage, { limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0);
  });

  it("stops if page returns 0 items (infinite-loop guard)", async () => {
    const fetchPage = vi.fn(async () => ({
      items: [] as number[],
      count: 999, // count says there's more, but page is empty
    }));

    const result = await paginateOffset(fetchPage);

    expect(result).toEqual([]);
    // Should not loop forever — should stop after first empty page
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("paginateCursor", () => {
  it("fetches 2 pages (hasMore=true then false), returns all items", async () => {
    let callNum = 0;
    const fetchPage = vi.fn(async (cursor?: string) => {
      callNum++;
      if (callNum === 1) {
        return {
          items: [1, 2, 3],
          hasMore: true,
          nextCursor: "page2",
        };
      }
      return {
        items: [4, 5],
        hasMore: false,
        nextCursor: null,
      };
    });

    const result = await paginateCursor(fetchPage);

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
    expect(fetchPage).toHaveBeenCalledWith("page2");
  });

  it("with limit=10 on a 25-item first page, returns 10", async () => {
    const fetchPage = vi.fn(async () => ({
      items: Array.from({ length: 25 }, (_, i) => i),
      hasMore: true,
      nextCursor: "next",
    }));

    const result = await paginateCursor(fetchPage, { limit: 10 });

    expect(result).toHaveLength(10);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("hasMore=false on first call, returns single page", async () => {
    const fetchPage = vi.fn(async () => ({
      items: [42],
      hasMore: false,
      nextCursor: null,
    }));

    const result = await paginateCursor(fetchPage);

    expect(result).toEqual([42]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("limit larger than total results, returns all without error", async () => {
    let callNum = 0;
    const fetchPage = vi.fn(async () => {
      callNum++;
      if (callNum === 1) {
        return { items: [1, 2], hasMore: true, nextCursor: "p2" };
      }
      return { items: [3], hasMore: false, nextCursor: null };
    });

    const result = await paginateCursor(fetchPage, { limit: 100 });

    expect(result).toEqual([1, 2, 3]);
  });

  it("limit=1 returns exactly 1 item from first page", async () => {
    const fetchPage = vi.fn(async () => ({
      items: [10, 20, 30],
      hasMore: true,
      nextCursor: "next",
    }));

    const result = await paginateCursor(fetchPage, { limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(10);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
