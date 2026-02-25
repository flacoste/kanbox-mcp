# kanbox-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MCP server for the [Kanbox](https://kanbox.io) LinkedIn CRM API. Exposes two dispatcher tools — `kanbox_read` (4 actions) and `kanbox_write` (5 actions) — for use with Claude Code and other MCP clients.

## Use cases

- **CRM triage** — Search unread inbox messages, read conversations, then draft and send replies — all from your editor.
- **Pipeline management** — Query contacts by pipeline/step, update labels or move contacts between steps based on conversation context.
- **Outreach automation** — Build a lead list, send personalized connection requests with icebreakers, and follow up with messages once connected.
- **Lead enrichment** — Add leads by LinkedIn URL for full background enrichment, then poll processing status until complete.
- **Contact lookup** — Resolve a LinkedIn profile slug to the internal `linkedin_id` needed for messaging, without leaving your workflow.

## Design

This server uses a **two-tool dispatcher pattern** instead of exposing 9 separate MCP tools. Inspired by [Jesse Vincent's article on MCP API design](https://blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis/), the goals are:

- **Minimal context footprint** — LLM clients load every tool definition into their context window. Two tools with action routing costs far less context than nine individual tool definitions, leaving more room for the actual conversation.
- **Self-documenting** — Each tool's description includes the full action catalog with parameter names and gotchas. The LLM gets everything it needs from the tool definition itself, without requiring external documentation in the system prompt.
- **Read/write permission split** — Two tools instead of one lets MCP clients auto-approve `kanbox_read` while requiring explicit confirmation for `kanbox_write`.
- **Flat responses** — The Kanbox API nests contact data under `lead.*` and `lnuser.*` keys. This server flattens responses so fields like `linkedin_id`, `firstname`, `email` appear at the top level, reducing the tokens the LLM spends parsing nested structures.

### Key response fields

`search_members` returns the richest data — these are your inbox/connection contacts:

> `id`, `linkedin_id`, `linkedin_public_id`, `firstname`, `lastname`, `email`, `phone`, `company`, `job`, `location`, `labels`, `pipeline`, `step`, `icebreaker`, `custom`, `conversations` (with `id`, `last_message`, `unread_count`)

`search_leads` returns scraped lead data (no `linkedin_id` — resolve via `search_members`):

> `linkedin_public_id`, `firstname`, `lastname`, `email`, `phone`, `company`, `job`, `location`

`list_lists` returns list metadata:

> `name`, `count`, `is_processing`

## Setup

In Kanbox Settings, turn on "Enable API Key" in the "API" section, then set the token in your environment:

```bash
export KANBOX_API_TOKEN=your_api_key
```

### Claude Code configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "kanbox": {
      "command": "npx",
      "args": ["-y", "github:flacoste/kanbox-mcp"],
      "env": {
        "KANBOX_API_TOKEN": "${KANBOX_API_TOKEN}"
      }
    }
  }
}
```

No local clone required — npx fetches the repo, installs dependencies, and builds automatically.

### Local install

If you prefer a local copy:

```bash
git clone https://github.com/flacoste/kanbox-mcp.git
cd kanbox-mcp
npm install  # also builds via prepare script
```

Then point the config at the local build:

```json
{
  "command": "node",
  "args": ["/path/to/kanbox-mcp/dist/index.js"],
  "env": {
    "KANBOX_API_TOKEN": "${KANBOX_API_TOKEN}"
  }
}
```

## Tools

### `kanbox_read`

Read-only queries against Kanbox data.

#### `search_members`

Search inbox, connections, or unread messages.

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | no | Fuzzy name search (a single distinctive term works best) |
| `type` | `inbox` \| `unread_inbox` \| `connections` | no | Filter by member type |
| `pipeline_name` | string | no | Filter by pipeline name |
| `step_title` | string | no | Filter by pipeline step title |
| `linkedin_public_ids` | string[] | no | Public profile slugs for exact lookup |
| `updated_since` | string | no | ISO 8601 timestamp filter |
| `limit` | number | no | Max results (1-100) |
| `offset` | number | no | Results to skip |

#### `search_leads`

Search scraped leads by list name or query.

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | List name filter |
| `q` | string | no | Search query |
| `limit` | number | no | Max results (1-100) |
| `offset` | number | no | Results to skip |

#### `get_messages`

Get conversation messages.

| Param | Type | Required | Description |
|---|---|---|---|
| `conversation_id` | number | **yes** | Conversation ID from `search_members` `conversations[].id` |
| `cursor` | string | no | Pagination cursor from previous response |

#### `list_lists`

List available Kanbox lead lists.

| Param | Type | Required | Description |
|---|---|---|---|
| `limit` | number | no | Max results (1-100) |
| `offset` | number | no | Results to skip |

### `kanbox_write`

Write operations. All writes are async (HTTP 202 Accepted).

#### `update_member`

Update member fields.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | number | **yes** | Member ID from `search_members` |
| `email` | string | no | Email address |
| `phone` | string | no | Phone number |
| `labels` | string[] | no | **Full replacement** — pass ALL desired labels |
| `pipeline` | string | no | Pipeline name |
| `step` | string | no | Pipeline step |
| `custom` | string | no | Custom note |
| `icebreaker` | string | no | Icebreaker note |

#### `send_message`

Send a LinkedIn message.

| Param | Type | Required | Description |
|---|---|---|---|
| `recipient_linkedin_id` | string | **yes** | Internal LinkedIn ID (`ACoAAA...` format) |
| `message` | string | **yes** | Message text (max 8000 chars) |

#### `send_connection`

Send a connection request.

| Param | Type | Required | Description |
|---|---|---|---|
| `recipient_linkedin_id` | string | **yes** | Internal LinkedIn ID (`ACoAAA...` format) |
| `message` | string | no | Request message (max 300 chars) |

#### `add_lead`

Add a structured lead to a list (partial enrichment only).

| Param | Type | Required | Description |
|---|---|---|---|
| `list` | string | **yes** | Kanbox list name |
| `linkedin_public_id` | string | **yes** | Public profile slug |
| `firstname` | string | **yes** | First name |
| `lastname` | string | **yes** | Last name |
| `email` | string | no | Email address |
| `phone` | string | no | Phone number |
| `company` | string | no | Company name |
| `location` | string | no | Location |
| `job` | string | no | Job title |
| `icebreaker` | string | no | Icebreaker note |
| `labels` | string[] | no | Labels |
| `pipeline` | string | no | Pipeline name |
| `step` | string | no | Pipeline step |

#### `add_lead_url`

Add a lead by LinkedIn URL for full enrichment (takes minutes).

| Param | Type | Required | Description |
|---|---|---|---|
| `linkedin_profile_url` | string | **yes** | Full LinkedIn profile URL |
| `list` | string | **yes** | Kanbox list name |

## Key conventions

- **`linkedin_id` vs public slug** — `search_members` returns a `linkedin_id` field (internal ID starting with `ACoAAA...`). Use this ID for `send_message` and `send_connection`, not the public profile slug.
- **Labels are full replacement** — `update_member` labels replace the entire label set. Read existing labels first, then pass the complete desired list.
- **Async writes** — All write operations return HTTP 202. Changes may take a few seconds to appear on subsequent reads.
- **Leads vs members** — `search_leads` does not return `linkedin_id`. Use `search_members` with `linkedin_public_ids` to resolve the internal ID needed for messaging.

## Development

```bash
npm run build       # tsc -> dist/
npm run dev         # tsx src/index.ts
npm test            # vitest run
npm run test:watch  # vitest (watch mode)
```

## License

[MIT](LICENSE)
