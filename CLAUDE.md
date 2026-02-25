# Kanbox MCP Server

MCP server wrapping the Kanbox LinkedIn CRM API with two dispatcher tools: `kanbox_read` (4 actions) and `kanbox_write` (5 actions).

## Commands

```bash
npm run build    # tsc → dist/
npm run dev      # tsx src/index.ts (needs KANBOX_API_TOKEN)
npm test         # vitest run
npm start        # node dist/index.js (needs KANBOX_API_TOKEN)
```

## Architecture

- **Entry point:** `src/index.ts` — McpServer setup, StdioServerTransport
- **Tools:** `src/tools/kanbox-read.ts`, `src/tools/kanbox-write.ts` — dispatcher pattern with Zod validation per action
- **Actions:** `src/actions/*.ts` — one file per API action
- **Lib:** `src/lib/kanbox-client.ts` (HTTP client), `src/lib/errors.ts` (error formatting), `src/lib/normalize.ts` (response flattening)
- **Tests:** `test/` mirrors `src/` structure. Integration tests use `InMemoryTransport.createLinkedPair()`.

## Conventions

- ESM (`"type": "module"`), all imports use `.js` extension
- Tool handlers never throw — always return `CallToolResult`
- Response normalization: members flatten `lead.*`, leads flatten `lnuser.*`
- Labels are FULL REPLACEMENT on write — callers must read-before-write
- 202 Accepted is treated as success, not error
- No `console.log` — stdout is JSON-RPC transport. Use `console.error` for debug.

## Environment

- `KANBOX_API_TOKEN` — required, Kanbox API key (X-API-Key header)

## MCP Configuration

Add to Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "kanbox": {
      "command": "node",
      "args": ["/path/to/kanbox-mcp/dist/index.js"],
      "env": {
        "KANBOX_API_TOKEN": "your_api_key"
      }
    }
  }
}
```
