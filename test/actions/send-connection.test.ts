import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendConnection } from "../../src/actions/send-connection.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("sendConnection", () => {
  let client: KanboxClient;
  let postSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    postSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    client.post = postSpy;
  });

  it("calls POST /public/connections", async () => {
    await sendConnection(client, {
      recipient_linkedin_id: "janedoe",
      message: "Let's connect!",
    });

    expect(postSpy).toHaveBeenCalledWith("/public/connections", {
      recipient_linkedin_id: "janedoe",
      message: "Let's connect!",
    });
  });

  it("works without optional message", async () => {
    await sendConnection(client, { recipient_linkedin_id: "janedoe" });

    expect(postSpy).toHaveBeenCalledWith("/public/connections", {
      recipient_linkedin_id: "janedoe",
    });
  });
});
