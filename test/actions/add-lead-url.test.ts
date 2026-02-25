import { describe, it, expect, vi, beforeEach } from "vitest";
import { addLeadUrl } from "../../src/actions/add-lead-url.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("addLeadUrl", () => {
  let client: KanboxClient;
  let postSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    postSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    client.post = postSpy;
  });

  it("calls POST /public/leadurl with query params only", async () => {
    await addLeadUrl(client, {
      linkedin_profile_url: "https://www.linkedin.com/in/johndoe",
      list: "Scraped",
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/public/leadurl",
      undefined,
      {
        linkedin_profile_url: "https://www.linkedin.com/in/johndoe",
        list: "Scraped",
      },
    );
  });

  it("includes async note about polling", async () => {
    const result = await addLeadUrl(client, {
      linkedin_profile_url: "https://www.linkedin.com/in/johndoe",
      list: "Scraped",
    });

    expect(result.note).toContain("is_processing");
    expect(result.note).toContain("several minutes");
  });
});
