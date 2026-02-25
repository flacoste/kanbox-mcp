---
title: "feat: Build Kanbox MCP Server"
type: feat
status: active
date: 2026-02-24
origin: docs/brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md
---

# feat: Build Kanbox MCP Server

## Overview

Build a TypeScript MCP server that wraps the Kanbox API (LinkedIn CRM) with two dispatcher tools — `kanbox_read` and `kanbox_write` — enabling Claude Code to read/write LinkedIn contact data. The dispatcher pattern minimizes context window overhead (~1,500 tokens for both tools) while leveraging Claude Code's permission system to auto-approve reads and require explicit approval for writes.

## Problem Statement / Motivation

LinkedIn contact data lives in Kanbox but workflows operate in the Obsidian vault. Currently there is no programmatic bridge between the two systems. Manual copy-paste is error-prone and doesn't scale for batch operations like syncing profile pictures, labels, or communication history across hundreds of contacts.

An MCP server is the right integration pattern because it is consistent with existing architecture (Slack MCP, planned Granola MCP), reusable across any skill or conversation, and provides full read-write access without predefined scripts.

(see brainstorm: docs/brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md)

## Proposed Solution

A standalone TypeScript MCP server using `@modelcontextprotocol/sdk` v1.x with stdio transport. Two dispatcher tools route to 9 actions backed by a thin HTTP client calling the Kanbox REST API at `https://api.kanbox.io`.

### Architecture

```
Claude Code
  ├── kanbox_read(action, params)  → auto-approved
  │     ├── search_members  → GET /public/members
  │     ├── search_leads    → GET /public/leads
  │     ├── get_messages    → GET /public/{conversation_id}/messages
  │     └── list_lists      → GET /public/lists
  │
  └── kanbox_write(action, params) → requires approval
        ├── update_member   → PATCH /public/members/{id}
        ├── send_message    → POST /public/messages
        ├── send_connection → POST /public/connections
        ├── add_lead        → POST /public/lead (structured, partial enrichment, immediate)
        └── add_lead_url    → POST /public/leadurl (URL-based, full enrichment, takes minutes)
```

### Project Structure

```
kanbox-mcp/
  src/
    index.ts                 # Entry point: server setup, tool registration, stdio transport
    tools/
      kanbox-read.ts         # Read tool: schema + dispatcher
      kanbox-write.ts        # Write tool: schema + dispatcher
    actions/
      search-members.ts      # GET /public/members
      search-leads.ts        # GET /public/leads
      get-messages.ts        # GET /public/{conversation_id}/messages
      list-lists.ts          # GET /public/lists
      update-member.ts       # PATCH /public/members/{id}
      send-message.ts        # POST /public/messages
      send-connection.ts     # POST /public/connections
      add-lead.ts            # POST /public/lead (structured)
      add-lead-url.ts        # POST /public/leadurl (URL-based, full enrichment)
    lib/
      kanbox-client.ts       # HTTP client (fetch-based, X-API-Key auth)
      errors.ts              # Error formatting utilities
      normalize.ts           # Response normalization (flatten + prune raw API responses)
  test/
    tools/
      kanbox-read.test.ts
      kanbox-write.test.ts
    actions/
      search-members.test.ts
      search-leads.test.ts
      get-messages.test.ts
      update-member.test.ts
      send-message.test.ts
      send-connection.test.ts
      add-lead.test.ts
      add-lead-url.test.ts
    lib/
      kanbox-client.test.ts
      normalize.test.ts
  package.json
  tsconfig.json
  .gitignore
  .env.example
  CLAUDE.md
```

## Technical Considerations

### Kanbox API Details

- **Base URL:** `https://api.kanbox.io`
- **Auth:** `X-API-Key` header with value from `KANBOX_API_TOKEN` env var. Also requires `Accept: application/json` header.
- **Docs:** `https://api.kanbox.io/docs#/` (Swagger UI), `https://api.kanbox.io/openapi.json` (OpenAPI spec)
- **Response codes:** 200 (success), 202 (accepted/async — writes take ~3-5s to be visible on read), 400 (bad request), 401 (unauthorized), 404 (not found)
- **Pagination:** Offset-based for members/leads/lists (`limit`, `offset`, response envelope `{items: [...], count: N}`), cursor-based for messages (`cursor`, 20 per page, `has_more`/`next_cursor`)
- **Rate limits:** Not documented — implement conservative throttling and handle 429 responses

### Key API Endpoint Mapping

| MCP Action | HTTP | Endpoint | Key Parameters |
|---|---|---|---|
| `search_members` | GET | `/public/members` | `q`, `type` (inbox\|unread_inbox\|connections), `pipeline_name`, `step_title`, `linkedin_public_ids[]`, `updated_since`, `limit`, `offset` |
| `search_leads` | GET | `/public/leads` | `name` (list name), `q` (search by name), `limit`, `offset` |
| `get_messages` | GET | `/public/{conversation_id}/messages` | `conversation_id` (integer), `cursor` (optional) |
| `list_lists` | GET | `/public/lists` | `limit`, `offset` |
| `update_member` | PATCH | `/public/members/{id}` | `id` (path); body: `email`, `phone`, `labels[]`, `pipeline`, `step`, `custom`, `icebreaker` |
| `send_message` | POST | `/public/messages` | body: `message`, `recipient_linkedin_id` |
| `send_connection` | POST | `/public/connections` | body: `recipient_linkedin_id`, `message` (optional, max 300 chars) |
| `add_lead` | POST | `/public/lead` | query: `list` (required, must be pre-existing list name); body: `linkedin_public_id` (required), `firstname` (required), `lastname` (required), `email`, `phone`, `company`, `location`, `job`, `icebreaker`, `labels[]`, `pipeline`, `step` |
| `add_lead_url` | POST | `/public/leadurl` | query: `linkedin_profile_url` (required, full LinkedIn profile URL), `list` (required, pre-existing list name). Asynchronous — full enrichment takes several minutes. Poll `list_lists` for `is_processing` to check status. |

### Response Normalization

The raw Kanbox API responses are verbose (~200 lines per member) with deep nesting and many unused fields. The MCP server normalizes responses to a flat, compact format. This reduces context window consumption while preserving all fields that workflows need.

**Design principles:**
- Flatten nested structures (`lead.*` → top level for members, `lnuser.*` → top level for leads)
- Strip enrichment metadata, processing flags, and internal IDs that callers never use
- Unify the shape so members and leads share the same core profile fields
- Keep JSON format (not YAML) — standard for MCP tool responses

#### `search_members` — normalized member shape (~30 lines vs ~200 raw)

```json
{
  "items": [
    {
      "id": 1234567890,
      "linkedin_public_id": "janedoe",
      "firstname": "Jane",
      "lastname": "Doe",
      "headline": "Senior Product Manager",
      "company": "Acme Corp",
      "company_headcount": 250,
      "company_linkedin_url": "https://www.linkedin.com/company/acme-corp",
      "company_website": "https://acme-corp.com",
      "job": "Senior Product Manager at Acme Corp",
      "location": "San Francisco, California, United States",
      "country": "United States",
      "email": null,
      "phone": null,
      "picture": "https://media.licdn.com/dms/image/v2/example...",
      "skills": ["Product Management", "Strategy", "..."],
      "languages": ["English"],
      "connections": 500,
      "is_connection": true,
      "is_lead": true,
      "degree": 1,
      "connected_at": "2026-01-15T10:30:00Z",
      "is_premium": false,
      "is_open_profile": false,
      "labels": [{"id": 1001, "name": "Priority", "color": "color6"}],
      "pipeline": null,
      "step": null,
      "icebreaker": null,
      "custom": null,
      "conversations": [
        {"id": 9876543, "last_activity": "2026-01-20T14:30:00.000Z"}
      ],
      "last_message": {
        "text": "Great meeting you at the conference last week!",
        "at": "2026-01-20T14:30:00.000Z",
        "from": "ACoAABExampleId123",
        "attachment_name": null,
        "attachment_type": null
      },
      "invitation_type": "SENT",
      "invitation_message": "Hi Jane, great meeting you at the conference!",
      "is_starred": false,
      "is_archived": false,
      "updated_at": "2026-01-21T09:00:00.000Z"
    }
  ],
  "count": 250
}
```

**Kept fields beyond core profile:** `company_headcount`, `company_linkedin_url`, `company_website` (lead qualification), `connections` (contact's connection count — useful for identifying superconnectors).

**Dropped fields:** `lead` wrapper, `user`, `linkedin_id`, `linkedin_plain_id`, `is_salesnav_id`, `firstname_cleaned`, `lastname_cleaned`, `salesnavigator_url`, `talent_url`, remaining `company_*` fields (~12: `company_description`, `company_industry`, `company_specialties`, `company_founded`, `company_type`, `company_city`, `company_country`, `company_state`, `company_id`, `company_logo`, `company_tagline`, `company_url`), `education_*` (6 fields), `job_description`, `*_position`/`*_company` (tenure fields), `industry`, `follower`, `is_online`, `is_sponsor`, `is_opentowork`, `email_is_enrichvalid`, `email_enrich`, `twitter`, `summary`, `dropcontact_*`, `fullenrich_*`, `is_used_*`, `connection_sync_at`, `invitation_sync_at`, `invitation_id`, `invitation_secret`, `moved_at`, `phone_enriching`, `is_enrich*`, `is_processed`, `is_groupchat`, `templates`, `webhook_*`, `remind_at`, `notes_count`, `step_name`, `lastactivity_at`, `score`, `score_comment`, `spotlight`, `was_connection`, `is_private`, `is_read`, `is_seen`

#### `search_leads` — normalized lead shape (same core fields + lead-specific)

```json
{
  "items": [
    {
      "lead_id": 5001,
      "member_id": 9876543,
      "linkedin_public_id": "johnsmith",
      "firstname": "John",
      "lastname": "Smith",
      "headline": "VP of Engineering",
      "company": "TechStart Inc",
      "company_headcount": 50,
      "company_linkedin_url": "https://www.linkedin.com/company/techstart-inc",
      "company_website": "https://techstart.io",
      "job": "VP of Engineering",
      "location": "Toronto, Ontario, Canada",
      "country": "Canada",
      "email": "jsmith@example.com",
      "phone": "555-123-4567",
      "picture": "https://media.licdn.com/dms/image/v2/example...",
      "skills": ["Engineering Management", "Cloud Architecture", "..."],
      "languages": ["English", "French"],
      "connections": 1200,
      "is_connection": true,
      "degree": 1,
      "connected_at": "2025-06-15T18:00:00Z",
      "labels": [
        {"id": 1002, "name": "Prospect", "color": "color13"},
        {"id": 1003, "name": "Technical", "color": "color42"}
      ],
      "invitation_type": "PENDING",
      "invitation_message": "Hi John, would love to connect!",
      "updated_at": "2025-06-20T12:00:00.000Z"
    }
  ],
  "count": 42
}
```

**Kept company fields:** `company_headcount`, `company_linkedin_url`, `company_website` — same minimal set as members.

**Key differences from raw:** Both `lead_id` and `member_id` are exposed (callers need `member_id` for `update_member`). If the lead has no associated member (`lnuser` is null), `member_id` is null. Profile fields are pulled from the lead top level, CRM fields from `lnuser`.

#### `get_messages` — kept mostly as-is (already compact)

```json
{
  "conversation_id": "9876543",
  "participant_name": "Jane Doe",
  "participant_linkedin_id": "ACoAABExampleId123",
  "messages": [
    {
      "text": "Looking forward to our call tomorrow",
      "from": "Jane Doe",
      "from_linkedin_id": "ACoAABExampleId123",
      "at": "2026-01-18T15:01:58.570Z",
      "is_from_participant": true,
      "attachment_name": null,
      "attachment_type": null
    }
  ],
  "has_more": true,
  "next_cursor": "1700000000000"
}
```

**Changes from raw:** Renamed `is_from_user` → `is_from_participant` (clearer semantics). Renamed `created_at` → `at`. Combined `from_firstname`/`from_lastname` into `from`. Dropped `id`, `html` (always null), `message_type` (always "text"), `attachment_url` (often null even when attachment exists). Dropped misleading `total_count` (was page size, not total).

#### `list_lists` — minimal shape

```json
{
  "items": [
    {"id": 1001, "name": "Scraped Leads", "total_count": 42, "is_processing": false},
    {"id": 1002, "name": "Conference Attendees", "total_count": 83, "is_processing": true}
  ],
  "count": 16
}
```

**Dropped:** Entire nested `user` object (repeated on every item), most enrichment/processing flags, `search_url`, `search_api_url`, `is_salesnav`, `is_talent`, `is_free_search`, `dynamic_*`, `exclude_*`, `icypeas_*`, `scraped_at`, `is_paused*`, `is_archived`, `users_count`, `duplicates`, `offset`, `is_dynamic`, `mail_count`, `phone_count`, `linkedin_count`, `match_count`

**Kept:** `is_processing` — indicates whether the list is actively importing/scraping leads (useful after `add_lead_url` calls to check import status)

### Raw API Response Structure (reference for normalization implementation)

For implementing the normalization layer, here is where fields live in the raw API responses:

**Members raw:** Profile data nested under `lead`, CRM state at top level
- `item.lead.linkedin_public_id` → `linkedin_public_id`
- `item.lead.firstname` → `firstname`
- `item.lead.picture` → `picture`
- `item.lead.company_headcount` → `company_headcount`
- `item.lead.company_linkedin_url` → `company_linkedin_url`
- `item.lead.company_website` → `company_website`
- `item.lead.connections` → `connections`
- `item.id` → `id`
- `item.labels` → `labels`
- `item.conversations_ids[].id` → `conversations[].id`

**Leads raw:** Profile data at top level, CRM state nested under `lnuser`
- `item.linkedin_public_id` → `linkedin_public_id`
- `item.id` → `lead_id`
- `item.company_headcount` → `company_headcount`
- `item.company_linkedin_url` → `company_linkedin_url`
- `item.company_website` → `company_website`
- `item.connections` → `connections`
- `item.lnuser.id` → `member_id`
- `item.lnuser.labels` → `labels`

### ID Resolution Flow

Vault workflows hold LinkedIn public IDs (from `LinkedIn:` frontmatter URLs). Kanbox uses integer IDs internally. The resolution path is:

1. Extract `linkedin_public_id` from vault LinkedIn URL
2. `search_members({ linkedin_public_ids: ["john-doe"] })` → returns full member data including Kanbox integer `id` and `conversations_ids[]`
3. Use top-level `id` (integer) for `update_member`
4. Use `conversations[0].id` (integer) for `get_messages` — note: raw API returns `conversations_ids` (array of objects, not bare integers), normalized to `conversations`
5. A member can have multiple `conversations` entries — these are separate 1:1 threads with the same person (not group chats), typically from different invitation paths

Note: `get_member` was dropped because `search_members` already returns complete member profiles. There is no workflow where you'd have a Kanbox integer ID without first calling `search_members`.

**Search caveat:** The `q` parameter does fuzzy matching and may return wrong results (e.g., searching "Jean-Luc Dupont" can match "Juan Duponte"). Use `linkedin_public_ids` for exact matching when possible.

### Labels Behavior (validated via API spike)

- **Read format:** Labels are returned as objects: `{id: 1001, name: "Priority", color: "color6"}`
- **Write format:** Labels are passed as string names: `["Priority", "Prospect"]`
- **Full replacement:** Passing `["Prospect"]` replaces ALL existing labels — does not merge/append
- **Non-existent labels silently ignored:** Passing `["NonExistentLabel"]` returns 202 but has no effect
- **Empty array clears all labels:** `{"labels": []}` removes all labels from the member
- **Callers MUST read-before-write** to avoid dropping labels: fetch current labels, merge in new ones, then update with full array

### Profile Pictures (validated via API spike)

- URLs are in `lead.picture` field (members) or top-level `picture` (leads)
- **Publicly accessible** — no auth required, returns `image/jpeg`
- **Signed LinkedIn CDN URLs with ~2 week expiration** (`e=` parameter is Unix timestamp)
- Workflows should download promptly and store locally, not persist the URL

### Message Attachments

- Attachment metadata (`attachment_name`, `attachment_type`) is available on messages
- **Download URLs (`attachment_url`) may be null** — metadata is present but download may not be possible via API
- `html` field is consistently null for regular LinkedIn messages

### API Limitations (validated via spike, to raise with Kanbox developers)

1. **`POST /public/leadurl` (URL-based scraping) is functional but slow.** The endpoint accepts the request (202) and asynchronously queues it for import. Full enrichment (company, location, skills, languages, etc.) takes several minutes. The `is_processing` flag on the target list indicates import is in progress. This is the preferred endpoint for adding leads since it produces fully enriched profiles.

2. **`POST /public/lists` creates Sales Navigator import lists**, not regular lists. If the user isn't connected to Sales Navigator, adding leads to API-created lists fails with 500. Lists must be created through the Kanbox UI for now. Dropped from the MCP action surface.

3. **`POST /public/lead` (structured) has limited visibility and enrichment.** The lead appears in the list view but not in the main leads UI. It must be manually "added to inbox" via the Kanbox UI to appear in the regular workflow. Only partial enrichment occurs (headline, picture) — company, location, skills remain empty. Prefer `add_lead_url` when full enrichment is needed.

4. **No API to add a lead to the inbox.** There is no public endpoint to move a lead from list-only to inbox visibility.

### Dispatcher Pattern — Zod Validation Strategy

Use `z.record(z.unknown())` for the top-level `params` schema (keeps tool descriptions compact for token budget). Validate with action-specific Zod schemas inside each switch case of the dispatcher. This gives clear validation errors without bloating tool descriptions.

```typescript
// Tool schema (compact — what the LLM sees)
const schema = {
  action: z.enum(["search_members", "search_leads", "get_messages", "list_lists"]),
  params: z.record(z.unknown()).optional(),
};

// Inside dispatcher (strict — what validates at runtime)
case "search_leads": {
  const p = z.object({ name: z.string().optional(), q: z.string().optional(), limit: z.number().int().optional(), offset: z.number().int().optional() }).parse(args.params);
  return formatResult(await searchLeads(p));
}
```

### Error Handling Contract

- Tool handlers never throw — always return `CallToolResult`
- Non-2xx HTTP responses → `{ content: [{ type: "text", text: "Kanbox API error <status>: <body>" }], isError: true }`
- Zod validation errors → `{ content: [{ type: "text", text: "Invalid parameters: <details>" }], isError: true }`
- 202 Accepted → success response (not `isError`), include "Operation accepted (async)" note
- 429 Too Many Requests → `isError: true` with retry-after if available

### Startup Behavior

1. Check `KANBOX_API_TOKEN` env var — fail fast with clear error if missing
2. No console.log (stdout is JSON-RPC transport) — use console.error for debug logging
3. Shebang (`#!/usr/bin/env node`) for direct execution

### SDK and Tooling

- `@modelcontextprotocol/sdk@^1.27.0` (v1.x stable branch)
- `zod@^3.25` (compatible with SDK)
- ESM (`"type": "module"` in package.json)
- `StdioServerTransport` for Claude Code integration
- Tool annotations: `readOnlyHint: true` on read tool, `destructiveHint: true` on write tool
- Build: `tsc` to `dist/`, `tsx` for dev
- Test: `vitest` with `InMemoryTransport.createLinkedPair()` for integration tests

### Token Budget

Tool descriptions target ~120 words / ~180 tokens of description text. With Zod enum + record schemas, total serialized tool definitions should be well under 1,500 tokens. Validate after implementation with the MCP Inspector.

## System-Wide Impact

- **Interaction graph:** MCP server is stateless — no callbacks, observers, or side effects beyond Kanbox API calls. Calling workflows in the vault handle all state management (sync timestamps, file updates).
- **Error propagation:** Kanbox HTTP errors → MCP `isError: true` responses → Claude interprets and retries or informs user. No silent failure swallowing.
- **State lifecycle risks:** Write operations (`update_member`, `add_lead`, `add_lead_url`) return 202 Accepted (async). `update_member`/`add_lead` are visible on reads after ~3-5 seconds. `add_lead_url` takes several minutes for full enrichment — poll `list_lists` for `is_processing` flag. Calling workflows should account for eventual consistency.
- **API surface parity:** This is the only Kanbox integration point. No other interfaces expose equivalent functionality.

## Acceptance Criteria

### Core Server

- [x] `kanbox_read` tool dispatches to 4 read actions (`search_members`, `search_leads`, `get_messages`, `list_lists`) and returns normalized Kanbox data
- [x] `kanbox_write` tool dispatches to 5 write actions (`update_member`, `send_message`, `send_connection`, `add_lead`, `add_lead_url`) and returns confirmation/error
- [x] Server starts via stdio transport with `node dist/index.js`
- [x] Server fails fast with clear error if `KANBOX_API_TOKEN` is not set
- [x] No stdout pollution — all debug output goes to stderr

### Read Actions

- [x] `search_members` — supports `q`, `linkedin_public_ids`, `updated_since`, `type`, `limit`, `offset`; returns full member profiles
- [x] `search_leads` — supports `name` (list filter), `q` (name search), `limit`, `offset`; returns scraped profiles not yet connected
- [x] `get_messages` — returns conversation messages with cursor pagination
- [x] `list_lists` — returns available Kanbox lists (needed for `add_lead` list parameter)

### Write Actions

- [x] `update_member` — updates member fields (email, phone, labels, pipeline, step, custom, icebreaker)
- [x] `send_message` — sends LinkedIn message via `recipient_linkedin_id`
- [x] `send_connection` — sends connection request with optional note
- [x] `add_lead` — adds structured lead (linkedin_public_id, firstname, lastname + optional fields) to a pre-existing named list
- [x] `add_lead_url` — adds lead by LinkedIn profile URL to a pre-existing named list; asynchronous with full enrichment (takes several minutes)

### Error Handling

- [x] Invalid action names return clear error
- [x] Invalid params return Zod validation error with field details
- [x] HTTP 4xx/5xx errors return `isError: true` with status code and message
- [x] 202 Accepted responses return success with async acknowledgment

### Response Normalization

- [x] Member responses flattened: `lead.*` fields promoted to top level, ~30 lines per member vs ~200 raw
- [x] Lead responses flattened: profile fields at top level, `member_id` extracted from `lnuser.id`
- [x] Messages: `is_from_user` renamed to `is_from_participant`, `from_firstname`/`from_lastname` combined into `from`
- [x] Lists: stripped to `{id, name, total_count, is_processing}` per item (no nested user objects)
- [x] Enrichment metadata, processing flags, and internal IDs stripped from all responses

### Quality

- [x] Integration tests using `InMemoryTransport` for both tools
- [x] Unit tests for each action with mocked HTTP client
- [x] Unit tests for normalization functions (raw → normalized shape)
- [ ] Tool descriptions total under 1,500 tokens (validate with MCP Inspector)
- [x] Works with Claude Code's MCP configuration (`claude_desktop_config.json` or `settings.json`)

## Success Metrics

- All 5 use cases from the brainstorm are unblocked (profile pictures, messages, labels, leads, messaging)
- Tool descriptions stay within token budget (<1,500 total)
- Per-contact workflows complete in <2 API calls for read operations
- No manual Kanbox UI interaction needed for supported operations (except: leads added via `add_lead`/`add_lead_url` require manual "add to inbox" in Kanbox UI — requested as API enhancement)

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Kanbox API rate limits unknown | High | Medium | Conservative throttling, 429 detection, empirical testing before batch use |
| Labels update is full replacement | Confirmed | High | Tool description must warn callers to read-before-write. Consider a helper note in `update_member` response. |
| Picture URLs expire in ~2 weeks | Confirmed | Low | Calling workflows download images immediately, not store URLs |
| Non-existent labels silently ignored | Confirmed | Medium | Document in tool description. Callers should use `list_lists` or existing member labels as reference. |
| 202 Accepted eventual consistency (~3-5s) | Confirmed | Low | Document in tool descriptions; calling workflows add delay before read-after-write |
| Token budget exceeded | Low | Medium | Measure after implementation; trim descriptions or drop examples if needed |
| Attachment download URLs may be null | Confirmed | Low | Metadata (name, type) available; download may not be possible. Document limitation. |

## Resolved Questions (from API spike 2026-02-24)

1. **Labels semantics** — **Full replacement.** Passing `["CTO Lunch"]` replaces all existing labels. Non-existent label names are silently ignored (202 but no effect). Empty array `[]` clears all labels.
2. **`conversations_ids` availability** — **Confirmed.** Array of objects (not integers) on `search_members` response. Use `.id` field for `get_messages`. Can have multiple entries (separate 1:1 threads, not group chats).
3. **Picture URL accessibility** — **Publicly downloadable.** Signed LinkedIn CDN URLs, `image/jpeg`, ~22KB. Expire in ~2 weeks (`e=` timestamp parameter).
4. **`is_from_user` semantics** — Means "from the other participant" (not from the API user/you).
5. **Message pagination** — 20 per page, cursor-based going backwards in time. `total_count` is page size, not total conversation length.
6. **Response nesting** — Members: profile under `lead`, CRM state at top level. Leads: profile at top level, CRM state under `lnuser`. Inverted structures.
7. **`q` search is fuzzy** — Can return wrong matches. Use `linkedin_public_ids` for exact lookups.
8. **`POST /public/leadurl` functional but slow** — Accepts request (202) and queues asynchronous import. Full enrichment (company, location, skills, languages) takes several minutes. Preferred over structured `POST /public/lead` when full profile data is needed.
9. **`POST /public/lists` creates Sales Navigator lists** — Not regular lists. API-created lists cause 500 when used as `add_lead` targets. Dropped from action surface.
10. **`POST /public/lead` works but with limitations** — Lead appears in list view only (not main leads UI), requires manual "add to inbox" in Kanbox. Partial enrichment (headline, picture).

## MVP Implementation Order

### Phase 1: Scaffold + Read Tool

```
src/index.ts
src/lib/kanbox-client.ts
src/lib/errors.ts
src/lib/normalize.ts
src/tools/kanbox-read.ts
src/actions/search-members.ts
src/actions/search-leads.ts
src/actions/get-messages.ts
src/actions/list-lists.ts
package.json
tsconfig.json
.gitignore
.env.example
```

### Phase 2: Write Tool

```
src/tools/kanbox-write.ts
src/actions/update-member.ts
src/actions/send-message.ts
src/actions/send-connection.ts
src/actions/add-lead.ts
src/actions/add-lead-url.ts
```

### Phase 3: Tests + Polish

```
test/tools/kanbox-read.test.ts
test/tools/kanbox-write.test.ts
test/actions/*.test.ts
test/lib/kanbox-client.test.ts
test/lib/normalize.test.ts
CLAUDE.md
```

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md](docs/brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md) — Key decisions carried forward: two-tool dispatcher pattern, TypeScript + separate repo, raw API passthrough (no vault interpretation in MCP)

### Internal References

- Kanbox API Swagger UI: `https://api.kanbox.io/docs#/`
- Kanbox OpenAPI Spec: `https://api.kanbox.io/openapi.json`

### External References

- [MCP TypeScript SDK (v1.x)](https://github.com/modelcontextprotocol/typescript-sdk) — Server setup, tool registration, InMemoryTransport for testing
- [Jesse Vincent: MCPs Are Not Like Other APIs](https://blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis/) — Dispatcher pattern rationale
- [NearForm: Implementing MCP Tips & Pitfalls](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — Tool descriptions, token budget, error handling
- [glassBead: Toolhost Pattern in MCP](https://glassbead-tc.medium.com/design-patterns-in-mcp-toolhost-pattern-59e887885df3) — Consolidation pattern
- [Codely: How to Test MCP Servers](https://codely.com/en/blog/how-to-test-mcp-servers) — Testing strategy
