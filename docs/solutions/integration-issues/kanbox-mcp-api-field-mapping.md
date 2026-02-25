---
title: "Kanbox MCP Server: API Response Shape Mismatches"
date: 2026-02-24
category: integration-issues
tags:
  - kanbox
  - mcp
  - typescript
  - linkedin-crm
  - api-integration
  - field-mapping
  - modelcontextprotocol-sdk
  - openapi-spec
component: kanbox-mcp
severity: high
symptoms:
  - "get_messages returns empty arrays — expected data under 'items' key instead of 'messages'"
  - "Participant info missing — expected nested 'user' object instead of flat participant_name/participant_id"
  - "normalizeMessage reads undefined sender ID from 'from' instead of 'from_linkedin_id'"
  - "Tool annotations silently ignored with server.tool(); requires server.registerTool()"
  - "normalizeMember returns null for degree, pipeline, step, last_message fields due to wrong field names"
---

# Kanbox MCP Server: API Response Shape Mismatches

## Problem

After building the Kanbox MCP server (TypeScript, `@modelcontextprotocol/sdk` v1.x), testing against the real API revealed that multiple field mappings were wrong. The implementation was based on the plan document and API spike notes, but several assumptions about response structure didn't match the actual OpenAPI spec.

The bugs were silent — no errors thrown, just empty arrays and null values where data should have been.

## Solution

### Bug 1: `get_messages` returns empty arrays

**Root cause:** The messages endpoint returns its array under `data.messages`, not `data.items` like members/leads/lists. Participant info is flat (`data.participant_name`, `data.participant_id`), not nested under `data.user`.

**Fix in `src/actions/get-messages.ts`:**

```typescript
// BEFORE (broken)
const { data } = await client.get<{
  items: unknown[];            // wrong key
  user: { ... } | null;       // wrong structure
}>(`/public/${id}/messages`, params);
messages: (data.items ?? []).map(normalizeMessage)  // always empty

// AFTER (correct)
const { data } = await client.get<{
  messages: unknown[];                    // correct key
  participant_name: string | null;        // flat field
  participant_id: string | null;          // flat field
}>(`/public/${id}/messages`, params);
messages: (data.messages ?? []).map(normalizeMessage)
```

### Bug 2: `normalizeMessage` wrong field for sender LinkedIn ID

**Root cause:** Used `raw.from` but the API field is `from_linkedin_id`.

```typescript
// BEFORE
from_linkedin_id: raw.from ?? null,
// AFTER
from_linkedin_id: raw.from_linkedin_id ?? null,
```

### Bug 3: `server.tool()` doesn't support annotations

**Root cause:** The MCP SDK `server.tool()` shorthand doesn't accept an annotations config. Tool annotations (readOnlyHint, destructiveHint, idempotentHint) were silently missing.

**Fix:** Switch to `server.registerTool()`:

```typescript
// BEFORE — no annotation support
server.tool("kanbox_read", DESCRIPTION, schema, handler);

// AFTER — full annotation support
server.registerTool("kanbox_read", {
  description: DESCRIPTION,
  inputSchema: schema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}, handler);
```

### Bug 4: `normalizeMember` field mapping mismatches

**Root cause:** Multiple fields used incorrect property names. Verified against OpenAPI spec at `https://api.kanbox.io/openapi.json`.

| Broken Reference | Correct Reference | Reason |
|---|---|---|
| `lead.degree` | `raw.degree` | `degree` is on `LinkedInUserOut`, not nested `LeadOut` |
| `raw.pipeline` | `raw.board` | Field is named `board` (integer) |
| `raw.step` | `raw.step_name` | `step` is int ID; `step_name` is display string |
| `lastMsg.text` | `lastMsg.last_message_text` | All last_message fields are prefixed |
| `lastMsg.at` | `lastMsg.last_message_at` | Prefixed |
| `lastMsg.from` | `lastMsg.last_message_from_id` | Prefixed + `_id` suffix |
| `lastMsg.attachment_name` | `lastMsg.last_message_attachment_name` | Prefixed |
| `lastMsg.attachment_type` | `lastMsg.last_message_attachment_type` | Prefixed |

**Known limitation:** `skills`, `languages`, `connections`, `is_premium`, `is_open_profile` only exist on `LeadOutFull` (leads endpoint), NOT on nested `LeadOut` inside members. These will always be empty/false for member responses.

## Prevention Strategies

### Checklist for validating field mappings

Use for every endpoint before writing handler code:

- [ ] Locate the endpoint in the **OpenAPI spec** (not docs, not plan — the actual spec)
- [ ] Identify the **response envelope** key (`items`, `messages`, `data`, etc.)
- [ ] List all fields by reading the **schema definition**, not by assuming from other endpoints
- [ ] Check for **flattened nested objects** (e.g., `last_message_text` not `last_message.text`)
- [ ] Verify **pagination fields** (offset/limit vs cursor, where `has_more`/`total` appear)
- [ ] Confirm **nullable/optional fields** and handle explicitly
- [ ] Test with a **real API call** and compare raw JSON to planned mapping
- [ ] Verify **SDK method signature** against installed package types, not online examples

### Key rules

1. **Never assume response envelope consistency across endpoints.** Different endpoints in the same API use different wrapper keys.
2. **Nested objects may be flattened with prefixes.** `last_message` is not `{ text, at }` — it's flat fields `last_message_text`, `last_message_at` on the parent.
3. **The OpenAPI spec is the single source of truth.** When plan/docs disagree with the spec, the spec wins.
4. **Verify SDK APIs against the installed version.** `server.tool()` vs `server.registerTool()` have different capabilities.

## Related Documentation

- **Origin brainstorm:** [docs/brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md](../../brainstorms/2026-02-24-kanbox-mcp-integration-brainstorm.md)
- **Implementation plan:** [docs/plans/2026-02-24-feat-kanbox-mcp-server-plan.md](../../plans/2026-02-24-feat-kanbox-mcp-server-plan.md)
- **Kanbox OpenAPI spec:** `https://api.kanbox.io/openapi.json`
- **MCP TypeScript SDK (v1.x):** `https://github.com/modelcontextprotocol/typescript-sdk`
