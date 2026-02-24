import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchLeads } from "../../src/actions/search-leads.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("searchLeads", () => {
  let client: KanboxClient;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    getSpy = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        items: [
          {
            id: 5001,
            linkedin_public_id: "john",
            firstname: "John",
            lastname: "Smith",
            headline: "VP Eng",
            company: "Tech",
            company_headcount: null,
            company_linkedin_url: null,
            company_website: null,
            connections: null,
            skills: [],
            languages: [],
            lnuser: { id: 9876, labels: [], is_connection: false },
          },
        ],
        count: 1,
      },
    });
    client.get = getSpy;
  });

  it("calls GET /public/leads with params", async () => {
    await searchLeads(client, { name: "My List", q: "john" });

    expect(getSpy).toHaveBeenCalledWith("/public/leads", { name: "My List", q: "john" });
  });

  it("returns normalized lead data with both IDs", async () => {
    const result = await searchLeads(client, {});

    expect(result.items[0].lead_id).toBe(5001);
    expect(result.items[0].member_id).toBe(9876);
    expect(result.items[0]).not.toHaveProperty("lnuser");
  });
});
