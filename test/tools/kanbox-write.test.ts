import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KanboxClient } from "../../src/lib/kanbox-client.js";
import { registerWriteTool } from "../../src/tools/kanbox-write.js";

describe("kanbox_write integration", () => {
  let client: Client;
  let server: McpServer;
  let kanboxClient: KanboxClient;
  let patchSpy: ReturnType<typeof vi.fn>;
  let postSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    kanboxClient = new KanboxClient({ apiToken: "test", baseUrl: "https://test.io" });
    patchSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    postSpy = vi.fn().mockResolvedValue({ status: 202, data: {} });
    kanboxClient.patch = patchSpy;
    kanboxClient.post = postSpy;

    server = new McpServer({ name: "test-kanbox", version: "0.0.1" });
    registerWriteTool(server, kanboxClient);

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

  it("lists kanbox_write as available tool", async () => {
    const { tools } = await client.listTools();
    const writeTool = tools.find((t) => t.name === "kanbox_write");
    expect(writeTool).toBeDefined();
    expect(writeTool!.description).toContain("update_member");
  });

  it("dispatches update_member action", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "update_member",
        params: { id: 123, labels: ["Priority"] },
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.note).toContain("FULL REPLACEMENT");

    expect(patchSpy).toHaveBeenCalledWith("/public/members/123", { labels: ["Priority"] });
  });

  it("dispatches send_message action", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "send_message",
        params: { recipient_linkedin_id: "jane", message: "Hi!" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(postSpy).toHaveBeenCalledWith("/public/messages", {
      recipient_linkedin_id: "jane",
      message: "Hi!",
    });
  });

  it("dispatches send_connection action", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "send_connection",
        params: { recipient_linkedin_id: "john", message: "Connect?" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(postSpy).toHaveBeenCalledWith("/public/connections", {
      recipient_linkedin_id: "john",
      message: "Connect?",
    });
  });

  it("dispatches add_lead action", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "add_lead",
        params: {
          list: "Conference",
          linkedin_public_id: "jane",
          firstname: "Jane",
          lastname: "Doe",
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(postSpy).toHaveBeenCalledWith(
      "/public/lead",
      { linkedin_public_id: "jane", firstname: "Jane", lastname: "Doe" },
      { list: "Conference" },
    );
  });

  it("dispatches add_lead_url action", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "add_lead_url",
        params: {
          linkedin_profile_url: "https://www.linkedin.com/in/janedoe",
          list: "Scraped",
        },
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(parsed.note).toContain("is_processing");
  });

  it("returns validation error for missing required params", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "update_member",
        params: {},
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Invalid parameters");
  });

  it("returns validation error for connection message over 300 chars", async () => {
    const result = await client.callTool({
      name: "kanbox_write",
      arguments: {
        action: "send_connection",
        params: {
          recipient_linkedin_id: "jane",
          message: "x".repeat(301),
        },
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Invalid parameters");
  });
});
