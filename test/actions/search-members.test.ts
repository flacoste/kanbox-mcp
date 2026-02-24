import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchMembers } from "../../src/actions/search-members.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("searchMembers", () => {
  let client: KanboxClient;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    getSpy = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        items: [
          {
            id: 1,
            lead: {
              linkedin_public_id: "jane",
              firstname: "Jane",
              lastname: "Doe",
              headline: "PM",
              company: "Acme",
              company_headcount: null,
              company_linkedin_url: null,
              company_website: null,
              connections: null,
              skills: [],
              languages: [],
            },
            labels: [],
            conversations_ids: [],
            is_connection: true,
            is_lead: false,
          },
        ],
        count: 1,
      },
    });
    client.get = getSpy;
  });

  it("calls GET /public/members with params", async () => {
    await searchMembers(client, { q: "jane", limit: 5 });

    expect(getSpy).toHaveBeenCalledWith("/public/members", { q: "jane", limit: 5 });
  });

  it("returns normalized member data", async () => {
    const result = await searchMembers(client, {});

    expect(result.count).toBe(1);
    expect(result.items[0].linkedin_public_id).toBe("jane");
    expect(result.items[0].id).toBe(1);
    expect(result.items[0]).not.toHaveProperty("lead");
  });

  it("passes linkedin_public_ids array", async () => {
    await searchMembers(client, { linkedin_public_ids: ["jane", "john"] });

    expect(getSpy).toHaveBeenCalledWith("/public/members", {
      linkedin_public_ids: ["jane", "john"],
    });
  });
});
