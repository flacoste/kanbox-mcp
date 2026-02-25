import { describe, it, expect, vi, beforeEach } from "vitest";
import { KanboxClient, KanboxApiError } from "../../src/lib/kanbox-client.js";

describe("KanboxClient", () => {
  let client: KanboxClient;

  beforeEach(() => {
    client = new KanboxClient({
      apiToken: "test-token",
      baseUrl: "https://api.test.io",
    });
  });

  it("sends X-API-Key and Accept headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"items":[]}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/public/members");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.io/public/members",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-API-Key": "test-token",
          Accept: "application/json",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("appends query params for GET requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/public/members", { q: "jane", limit: 10 });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=jane");
    expect(calledUrl).toContain("limit=10");

    vi.unstubAllGlobals();
  });

  it("appends array params as repeated keys (no [] suffix)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/public/members", { linkedin_public_ids: ["a", "b"] });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("linkedin_public_ids=a");
    expect(calledUrl).toContain("linkedin_public_ids=b");
    expect(calledUrl).not.toContain("linkedin_public_ids%5B%5D");

    vi.unstubAllGlobals();
  });

  it("skips null/undefined params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/public/members", { q: "jane", type: undefined, limit: null });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=jane");
    expect(calledUrl).not.toContain("type");
    expect(calledUrl).not.toContain("limit");

    vi.unstubAllGlobals();
  });

  it("throws KanboxApiError on non-2xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"detail":"Unauthorized"}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.get("/public/members")).rejects.toThrow(KanboxApiError);
    await expect(client.get("/public/members")).rejects.toThrow("401");

    vi.unstubAllGlobals();
  });

  it("treats 202 as success (not error)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 202,
      text: () => Promise.resolve('{"success":true}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.patch("/public/members/1", { email: "new@test.com" });

    expect(result.status).toBe(202);
    expect(result.data).toEqual({ success: true });

    vi.unstubAllGlobals();
  });

  it("sends JSON body for POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.post("/public/messages", { message: "Hi", recipient_linkedin_id: "xyz" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test.io/public/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Hi", recipient_linkedin_id: "xyz" }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("sends query params for POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.post("/public/lead", { firstname: "A" }, { list: "My List" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("list=My+List");

    vi.unstubAllGlobals();
  });
});
