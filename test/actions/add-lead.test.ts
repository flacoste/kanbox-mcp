import { describe, it, expect, vi, beforeEach } from "vitest";
import { addLead } from "../../src/actions/add-lead.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("addLead", () => {
  let client: KanboxClient;
  let postSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    postSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    client.post = postSpy;
  });

  it("calls POST /public/lead with body and list query param", async () => {
    await addLead(client, {
      list: "Conference Leads",
      linkedin_public_id: "johndoe",
      firstname: "John",
      lastname: "Doe",
      company: "Acme",
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/public/lead",
      {
        linkedin_public_id: "johndoe",
        firstname: "John",
        lastname: "Doe",
        company: "Acme",
      },
      { list: "Conference Leads" },
    );
  });

  it("includes limitation note in response", async () => {
    const result = await addLead(client, {
      list: "Test",
      linkedin_public_id: "x",
      firstname: "A",
      lastname: "B",
    });

    expect(result.note).toContain("partial enrichment");
    expect(result.note).toContain("add_lead_url");
  });
});
