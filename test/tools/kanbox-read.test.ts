import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";
import { registerReadTool } from "../../src/tools/kanbox-read.js";

describe("kanbox_read integration", () => {
  let client: Client;
  let server: McpServer;
  let kanboxClient: KanboxClient;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    kanboxClient = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    getSpy = vi.fn();
    kanboxClient.get = getSpy;

    server = new McpServer({ name: "test-kanbox", version: "0.0.1" });
    registerReadTool(server, kanboxClient);

    client = new Client({ name: "test-client", version: "0.0.1" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("lists kanbox_read as available tool", async () => {
    const { tools } = await client.listTools();
    const readTool = tools.find((t) => t.name === "kanbox_read");
    expect(readTool).toBeDefined();
    expect(readTool!.description).toContain("search_members");
  });

  it("dispatches search_members action", async () => {
    getSpy.mockResolvedValue({
      status: 200,
      data: {
        items: [{ id: 1, lead: { linkedin_public_id: "jane", firstname: "Jane", lastname: "Doe", skills: [], languages: [] }, labels: [], conversations_ids: [], is_connection: true, is_lead: false }],
        count: 1,
      },
    });

    const result = await client.callTool({
      name: "kanbox_read",
      arguments: { action: "search_members", params: { q: "jane" } },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.items[0].linkedin_public_id).toBe("jane");
  });

  it("dispatches list_lists action", async () => {
    getSpy.mockResolvedValue({
      status: 200,
      data: {
        items: [{ id: 1, name: "My List", total_count: 10, is_processing: false }],
        count: 1,
      },
    });

    const result = await client.callTool({
      name: "kanbox_read",
      arguments: { action: "list_lists", params: {} },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.items[0].name).toBe("My List");
  });

  it("returns validation error for invalid params", async () => {
    const result = await client.callTool({
      name: "kanbox_read",
      arguments: { action: "get_messages", params: {} },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Invalid parameters");
    expect(text).toContain("conversation_id");
  });

  it("returns API error as isError response", async () => {
    const { KanboxApiError } = await import("../../src/lib/kanbox-client.js");
    getSpy.mockRejectedValue(new KanboxApiError(401, "Unauthorized"));

    const result = await client.callTool({
      name: "kanbox_read",
      arguments: { action: "search_members", params: {} },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("401");
  });
});
