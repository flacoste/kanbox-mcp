import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateMember } from "../../src/actions/update-member.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("updateMember", () => {
  let client: KanboxClient;
  let patchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    patchSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    client.patch = patchSpy;
  });

  it("calls PATCH /public/members/{id} with body", async () => {
    await updateMember(client, {
      id: 123,
      email: "new@test.com",
      labels: ["Priority", "Prospect"],
    });

    expect(patchSpy).toHaveBeenCalledWith("/public/members/123", {
      email: "new@test.com",
      labels: ["Priority", "Prospect"],
    });
  });

  it("returns success with async note for 202", async () => {
    const result = await updateMember(client, { id: 123 });

    expect(result.success).toBe(true);
    expect(result.status).toBe(202);
    expect(result.note).toContain("FULL REPLACEMENT");
  });
});
