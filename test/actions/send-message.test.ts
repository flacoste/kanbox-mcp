import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../../src/actions/send-message.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("sendMessage", () => {
  let client: KanboxClient;
  let postSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    postSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    client.post = postSpy;
  });

  it("calls POST /public/messages with body", async () => {
    await sendMessage(client, {
      recipient_linkedin_id: "janedoe",
      message: "Hello!",
    });

    expect(postSpy).toHaveBeenCalledWith("/public/messages", {
      recipient_linkedin_id: "janedoe",
      message: "Hello!",
    });
  });

  it("returns delivery confirmation", async () => {
    const result = await sendMessage(client, {
      recipient_linkedin_id: "janedoe",
      message: "Hi",
    });

    expect(result.success).toBe(true);
    expect(result.recipient_linkedin_id).toBe("janedoe");
  });
});
