---
date: 2026-04-02
topic: cli-entry-point
---

# KanBox CLI Entry Point

## Problem Frame

The KanBox MCP server is used by Claude Code skills that process contacts in
batch (batch-canonicalize, event-debrief, comms-review). MCP tool responses
flow into the LLM context window, where they compound: each of the ~500
assistant turns in a batch session re-sends the full accumulated context.

A 50-contact batch canonicalization session generated ~315K chars of KanBox
MCP responses (61% of all tool results). With ~536 turns, the cumulative
input reached ~98.5M tokens — the dominant cost driver. The root cause is
structural: MCP responses are designed for interactive use, not bulk data
pipelines. MCP responses flow into the LLM conversation context with no
built-in mechanism to redirect them to files.

A CLI entry point sharing the same client, actions, and normalization code
would let batch workflows write results to temp files and extract only the
fields they need via `jq`, keeping bulk KanBox data out of the LLM context
entirely.

## Context for This Session

This requirements doc was produced in the Obsidian vault project
(`The VPE Coach`) after analyzing session `854317e9` — a 50-contact
batch canonicalization run. The analysis identified KanBox response
volume as the #1 token cost driver.

### Relevant source architecture (already exists)

```
src/
  index.ts              ← MCP entry point (McpServer + StdioServerTransport)
  lib/
    kanbox-client.ts    ← KanboxClient (HTTP, auth, error handling)
    normalize.ts        ← normalizeMember, normalizeLead, normalizeMessage, normalizeList
    errors.ts           ← error formatting
  actions/
    search-members.ts   ← searchMembers(client, params) → { items, count }
    search-leads.ts     ← searchLeads(client, params) → { items, count }
    get-messages.ts     ← getMessages(client, params) → { messages, has_more, ... }
    list-lists.ts       ← listLists(client, params) → { items }
    add-lead.ts         ← addLead(client, params)
    add-lead-url.ts     ← addLeadUrl(client, params)
    update-member.ts    ← updateMember(client, params)
    send-message.ts     ← sendMessage(client, params)
    send-connection.ts  ← sendConnection(client, params)
  tools/
    kanbox-read.ts      ← MCP dispatcher for read actions
    kanbox-write.ts     ← MCP dispatcher for write actions
```

Key points:
- Actions are pure functions: `(client, params) → result`. No MCP coupling.
- `KanboxClient` handles auth (`KANBOX_API_TOKEN` env var), HTTP, timeouts.
- `normalize.ts` flattens verbose API responses (members flatten `lead.*`,
  leads flatten `lnuser.*`).
- ESM throughout, `.js` extensions in imports.
- `package.json`: `"bin": "dist/index.js"` (currently MCP-only).

### Token cost data from the analyzed session

| Source | Chars | % of tool results |
|---|---|---|
| KanBox `search_members` (5 batch calls) | ~110K | 21% |
| KanBox `get_messages` (75 calls) | ~255K | 49% |
| File reads | 119K | 23% |
| Email + other | 31K | 6% |

The CLI needs to cover `search_members` and `get_messages` at minimum —
they account for 70% of context bloat. All four read actions are included
for completeness since the marginal cost of adding `search_leads` and
`list_lists` is low (same pagination patterns, same normalize functions).

## Requirements

**CLI Infrastructure**

- R1. Add `src/cli.ts` as a second entry point that reuses `KanboxClient`,
  actions, and normalize code. New code is limited to CLI arg parsing and
  pagination loops (existing actions are single-page fetchers).
- R2. Register both entry points in `package.json` `"bin"` field (change
  from current string format to object) so `npm link` exposes both
  `kanbox-mcp` (MCP server) and `kanbox` (CLI) as shell commands.
- R3. CLI reads `KANBOX_API_TOKEN` from environment (same as MCP server).
- R4. Output is JSON to stdout by default. Callers pipe to files or `jq`
  as needed. No built-in formatting or field selection — `jq` does that
  better.
- R5. Errors go to stderr. Exit code 0 on success, 1 on error. If
  `KANBOX_API_TOKEN` is not set, print a clear error to stderr and exit 1
  before making any API calls.

**Read Commands**

- R6. `kanbox search-members` — accepts `--q`, `--linkedin-public-ids`
  (comma-separated), `--type`, `--pipeline-name`, `--step-title`,
  `--updated-since` (ISO 8601), optional `--limit`. All filters match
  the MCP tool's parameters. Auto-paginates through all results by
  default; `--limit N` stops after N items. Outputs normalized member
  JSON array.
- R7. `kanbox get-messages` — accepts conversation ID as positional arg,
  optional `--limit`. Auto-paginates through all messages by default;
  `--limit N` stops after N messages. Outputs normalized message array.
- R8. `kanbox search-leads` — accepts `--q`, `--name` (list name filter),
  optional `--limit`. Auto-paginates through all results by default;
  `--limit N` stops after N items. Outputs normalized lead JSON array.
- R9. `kanbox list-lists` — no required args, optional `--limit`.
  Auto-paginates through all lists by default. Outputs normalized list
  array.

**Pagination**

- R10. All paginated commands auto-paginate internally, exhausting all
  pages by default. The caller never sees cursors, offsets, or page tokens.
  Two loop implementations needed: offset-based (search-members,
  search-leads, list-lists) and cursor-based (get-messages).
- R11. Optional `--limit N` flag on paginated commands stops fetching after
  N items have been collected. If a page fetch returns more items than
  needed to reach N, the excess is trimmed client-side. For get-messages,
  `--limit` is enforced entirely client-side (the API has no per-page
  limit parameter).

**Argument Parsing**

- R12. Use a lightweight arg parser. No heavy framework — the commands are
  simple enough for `parseArgs` from `node:util` (available since Node 18.3).

## Success Criteria

- `kanbox search-members --q "Herzog" | jq '.[].linkedin_public_id'` works
  from the shell and produces the same normalized data as the MCP tool
- `kanbox get-messages 6925049 > /tmp/conv.json` fetches all messages
  (auto-paginated) to a file without any LLM context involvement
- `kanbox search-members --q "Herzog" --limit 5` returns exactly 5 items
  (or fewer if the total result set is smaller)
- `npm run build` produces both `dist/index.js` (MCP) and `dist/cli.js`
  (CLI) from the same source
- Existing MCP server behavior is unchanged
- No new runtime dependencies beyond what's already in `package.json`

## Scope Boundaries

- Read-only. All write operations remain MCP-only for now.
- No built-in rate limiting or backoff. If Kanbox API rate limits are hit
  during auto-pagination, the request fails and the CLI exits with an error.
  Retry/backoff can be added later if needed.
- No shell completion, man pages, or help beyond `--help` flag.
- No changes to existing MCP tool behavior or normalize output shapes.

## Key Decisions

- **Same repo, same build**: CLI shares `src/` with MCP server. One
  `npm run build` produces both. This avoids code duplication and
  keeps normalization logic in sync.
- **JSON to stdout, not file output flags**: Callers decide where output
  goes (`> file`, `| jq`). CLI stays simple.
- **`node:util` parseArgs over dependencies**: Avoids adding a dep for
  something this simple. All commands have flat, non-nested args.
- **Internal auto-pagination**: CLI exhausts all pages by default so
  callers get complete results in one invocation. `--limit` provides an
  opt-in cap. Cursors and offsets are never exposed.
- **Read-only scope**: Write commands are excluded. MCP remains the write
  interface — it's used interactively where context-window cost is low.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Deferred] Confirm no conflicts with existing `kanbox` npm
  package before publishing. For local `npm link` use, `kanbox` is fine.
- [Affects R10][Resolved] Pagination models confirmed from codebase:
  search-members, search-leads, and list-lists use offset-based pagination
  (limit/offset params, items[]/count response); get-messages uses
  cursor-based pagination (cursor param, has_more/next_cursor response).
  Two pagination loop implementations are needed.
- [Affects R12][Needs research] Confirm `node:util` `parseArgs` covers
  all needed patterns (positional args + named options + comma-separated
  arrays).

## Next Steps

→ `/ce:plan` for structured implementation planning (in the kanbox-mcp repo session)
