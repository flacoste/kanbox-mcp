import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMessages } from "../../src/actions/get-messages.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";

describe("getMessages", () => {
  let client: KanboxClient;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    getSpy = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        messages: [
          {
            text: "Hello!",
            from_firstname: "Jane",
            from_lastname: "Doe",
            from: "ACoAABExample",
            created_at: "2026-01-18T15:00:00Z",
            is_from_user: true,
            attachment_name: null,
            attachment_type: null,
          },
        ],
        has_more: true,
        next_cursor: "1700000000000",
        participant_name: "Jane Doe",
        participant_id: "ACoAABExample",
      },
    });
    client.get = getSpy;
  });

  it("calls GET /public/{conversation_id}/messages", async () => {
    await getMessages(client, { conversation_id: 9876 });

    expect(getSpy).toHaveBeenCalledWith("/public/9876/messages", {});
  });

  it("passes cursor parameter", async () => {
    await getMessages(client, { conversation_id: 9876, cursor: "123456" });

    expect(getSpy).toHaveBeenCalledWith("/public/9876/messages", { cursor: "123456" });
  });

  it("returns normalized messages with pagination", async () => {
    const result = await getMessages(client, { conversation_id: 9876 });

    expect(result.conversation_id).toBe("9876");
    expect(result.participant_name).toBe("Jane Doe");
    expect(result.participant_linkedin_id).toBe("ACoAABExample");
    expect(result.messages[0].from).toBe("Jane Doe");
    expect(result.messages[0].is_from_participant).toBe(true);
    expect(result.messages[0].at).toBe("2026-01-18T15:00:00Z");
    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe("1700000000000");
  });
});
