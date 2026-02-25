#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KanboxClient } from "./lib/kanbox-client.js";
import { registerReadTool } from "./tools/kanbox-read.js";
import { registerWriteTool } from "./tools/kanbox-write.js";

const apiToken = process.env.KANBOX_API_TOKEN;

if (!apiToken) {
  console.error("KANBOX_API_TOKEN environment variable is required");
  process.exit(1);
}

const client = new KanboxClient({ apiToken });

const server = new McpServer({
  name: "kanbox",
  version: "1.0.0",
});

registerReadTool(server, client);
registerWriteTool(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Kanbox MCP server running on stdio");
