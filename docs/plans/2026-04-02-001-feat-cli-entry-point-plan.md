---
title: "feat: Add CLI entry point with auto-pagination"
type: feat
status: active
date: 2026-04-02
origin: docs/brainstorms/2026-04-02-cli-entry-point-requirements.md
---

# feat: Add CLI entry point with auto-pagination

## Overview

Add a read-only CLI (`src/cli.ts`) alongside the existing MCP server so batch
workflows can pipe KanBox data to files via shell commands instead of flowing
it through the LLM context window. The CLI reuses existing actions, client,
and normalize code. New code is limited to arg parsing, two pagination
helpers (offset-based and cursor-based), and command dispatch.

## Problem Frame

Batch skills (batch-canonicalize, event-debrief, comms-review) route all
KanBox API responses through the MCP server into the LLM context. A 50-contact
session accumulated ~315K chars of KanBox data (61% of tool results), which
compounded across ~536 turns to ~98.5M cumulative input tokens. A CLI entry
point lets callers write results to temp files and extract fields via `jq`,
keeping bulk data out of the context entirely.
(see origin: `docs/brainstorms/2026-04-02-cli-entry-point-requirements.md`)

## Requirements Trace

- R1. `src/cli.ts` reuses KanboxClient, actions, normalize; new code = arg parsing + pagination loops
- R2. `package.json` `bin` field changes from string to object exposing `kanbox-mcp` and `kanbox`
- R3. CLI reads `KANBOX_API_TOKEN` from env
- R4. JSON to stdout, callers pipe to files or `jq`
- R5. Errors to stderr, exit 0/1, early exit if token missing
- R6. `search-members` with all MCP filters + `--limit` + auto-pagination
- R7. `get-messages` with conversation ID positional + `--limit` + auto-pagination
- R8. `search-leads` with `--q`, `--name`, `--limit` + auto-pagination
- R9. `list-lists` with `--limit` + auto-pagination
- R10. Internal auto-pagination: offset-based (R6/R8/R9) and cursor-based (R7)
- R11. `--limit N` stops after N items, trims excess client-side
- R12. `node:util` `parseArgs` for arg parsing

## Scope Boundaries

- Read-only. Write operations remain MCP-only.
- No rate limiting or backoff. API errors during pagination fail the CLI.
- No shell completion, man pages, or help beyond `--help`.
- No changes to existing MCP tool behavior or normalize output shapes.

## Context & Research

### Relevant Code and Patterns

- **Action signatures**: All read actions are `(client, params) => Promise<{ items: T[], count: number }>` except `getMessages` which returns `{ messages: T[], has_more, next_cursor, ... }`. Actions already normalize data internally — CLI just collects pages.
- **MCP dispatcher pattern** (`src/tools/kanbox-read.ts`): switch on action string, Zod parse, call action, formatResult. The CLI replaces this with parseArgs + pagination loop + JSON.stringify.
- **Entry point pattern** (`src/index.ts`): top-level await, token check with `console.error` + `process.exit(1)`, shebang `#!/usr/bin/env node`.
- **Error classes**: `KanboxApiError` (HTTP errors with status+body), `ZodError` (validation). The CLI catches these and formats to stderr text (not MCP `CallToolResult`).
- **Import convention**: ESM, all imports use `.js` extension.
- **Offset pagination bounds**: `limit` is 1-100 (Zod `.max(100)`), `offset` is 0+. Pagination loop must use max page size (100) internally.
- **Cursor pagination**: `getMessages` accepts `cursor` (optional string), returns `has_more` + `next_cursor`. No per-page limit parameter.
- **Array params**: `KanboxClient.get()` serializes arrays as repeated query params via `url.searchParams.append`.

### Institutional Learnings

- **stdout discipline** (from `docs/solutions/code-quality/mcp-server-code-review-hardening.md`): stdout is JSON-RPC in MCP mode. CLI uses stdout for JSON output — ensure no shared code writes to stdout.
- **API response shape mismatches** (from `docs/solutions/integration-issues/kanbox-mcp-api-field-mapping.md`): `get_messages` uses `data.messages`, others use `data.items`. Pagination fields vary by endpoint. Already accounted for in action layer — CLI reuses actions, not raw API.

## Key Technical Decisions

- **Two generic pagination helpers, not per-command loops**: An offset-based paginator and a cursor-based paginator, each accepting the action function as a parameter. This avoids duplicating loop logic across 4 commands while keeping pagination patterns explicit. The offset paginator works for search-members, search-leads, and list-lists (all share `{items, count}` return shape). The cursor paginator works for get-messages.
- **Pagination helpers buffer all results in memory**: Results are collected into an array and serialized as a single JSON array to stdout after all pages are fetched. This ensures valid JSON even on error-free runs. If a mid-pagination error occurs, no partial output reaches stdout — the error goes to stderr and the CLI exits 1. Streaming (JSON Lines) is deferred to a future iteration if memory becomes a concern.
- **parseArgs with manual transforms**: `node:util` `parseArgs` handles option parsing. Comma-separated `--linkedin-public-ids` is split manually via `.split(',')`. Positional `conversation_id` is parsed via `parseInt()`. Kebab-case CLI flags map to snake_case action params via a simple object literal — no generic transform needed for 4 commands.
- **Reuse Zod schemas for CLI param validation**: After parseArgs transforms flags into a params object, pass it through the existing action Zod schema (e.g., `searchMembersSchema.parse(params)`). This is ~1 line per command, reuses existing schemas, and produces clear validation errors matching MCP behavior. Actions don't validate at runtime — Zod is only called by dispatchers — so the CLI must validate before calling actions.
- **Compact JSON output by default**: `JSON.stringify(items)` without indentation. Callers use `jq .` if they want pretty output. Consistent with MCP server convention (see learnings).

## Open Questions

### Resolved During Planning

- **parseArgs capability**: `node:util` `parseArgs` (Node 18.3+) supports `allowPositionals: true`, `type: 'string'`/`'boolean'` options, and `multiple: true`. It does NOT split comma-separated values — manual `.split(',')` needed for `--linkedin-public-ids`. Positional args return as strings — `parseInt()` needed for conversation_id. This covers all R6-R9/R12 patterns.
- **Pagination models**: Confirmed from codebase. Offset-based: search-members, search-leads, list-lists (limit/offset params, items[]/count response, page size max 100). Cursor-based: get-messages (cursor param, has_more/next_cursor response, no per-page limit).
- **`bin` field format**: Current string `"bin": "dist/index.js"` must change to object `"bin": {"kanbox-mcp": "dist/index.js", "kanbox": "dist/cli.js"}`. This preserves the existing MCP binary name.

### Deferred to Implementation

- **npm package name conflict**: Whether `kanbox` conflicts with an existing npm package. Only matters for `npm publish`, not `npm link`. Check before publishing.
- **Node.js minimum version**: `parseArgs` requires Node 18.3+. Verify `package.json` `engines` field and update if needed.

## Execution Posture

**TDD (red-green)**: Each unit writes failing tests first, then implements
the minimum code to make them pass. This is explicitly the workflow for all
units below.

## Implementation Units

- [ ] **Unit 1: CLI scaffold and package.json**

**Goal:** Minimal working CLI entry point that parses commands and exits with help or error.

**Requirements:** R1, R2, R3, R5, R12

**Dependencies:** None

**Execution note:** Test-first. Write all test scenarios as failing tests before creating `src/cli.ts`.

**Files:**
- Test: `test/cli.test.ts` (write first)
- Create: `src/cli.ts`
- Modify: `package.json` (bin field)

**Approach:**

*Red phase* — Write `test/cli.test.ts` with tests that import and invoke the CLI's main dispatch function (or spawn the process). All tests fail because `src/cli.ts` does not exist yet.

*Green phase* — Create `src/cli.ts`:
- Shebang, top-level await
- Parse `--help` and command name BEFORE token check, so help is always available regardless of environment
- Parse first positional arg as command name (`search-members`, `get-messages`, `search-leads`, `list-lists`)
- Unknown command or `--help` prints usage to stderr and exits
- Token check runs after command dispatch is resolved but before any API call
- Read optional `KANBOX_BASE_URL` env var and pass as `baseUrl` to KanboxClient constructor (enables integration testing and non-production use)
- Each command is a function that receives remaining argv — implemented as stubs returning `[]` in this unit
- `package.json` bin changes from string to object: `{"kanbox-mcp": "dist/index.js", "kanbox": "dist/cli.js"}`

**Patterns to follow:**
- `src/index.ts` — shebang, token check, top-level await
- ESM imports with `.js` extension

**Test scenarios:**
- Happy path: CLI with `--help` flag prints usage to stderr and exits 0
- Happy path: CLI with valid command name and `--help` prints command-specific usage to stderr
- Error path: CLI with no `KANBOX_API_TOKEN` prints error to stderr and exits 1
- Error path: CLI with unknown command prints error to stderr and exits 1
- Edge case: CLI with no arguments prints usage to stderr

**Verification:**
- All Unit 1 tests pass (were red, now green)
- `npm run build` produces `dist/cli.js` alongside `dist/index.js`
- Existing `node dist/index.js` MCP server still works

- [ ] **Unit 2: Pagination helpers**

**Goal:** Two generic pagination functions — offset-based and cursor-based — that auto-fetch all pages and support `--limit`.

**Requirements:** R10, R11

**Dependencies:** Unit 1

**Execution note:** Test-first. Write all paginator tests with mock fetchPage functions before creating `src/lib/paginate.ts`.

**Files:**
- Test: `test/lib/paginate.test.ts` (write first)
- Create: `src/lib/paginate.ts`

**Approach:**

*Red phase* — Write `test/lib/paginate.test.ts` with mock `fetchPage` functions (simple arrays, counters). Tests import `paginateOffset` and `paginateCursor` from `src/lib/paginate.js` — all fail because the module does not exist.

*Green phase* — Create `src/lib/paginate.ts`:
- `paginateOffset<T>(fetchPage, options?)` — generic over item type T. `fetchPage` is `(limit, offset) => Promise<{items: T[], count: number}>`. Loop: set page size to 100, increment offset by items received, stop when `offset >= count` or limit reached or page returns 0 items (defensive infinite-loop guard). Trim to limit if needed.
- `paginateCursor<T>(fetchPage, options?)` — `fetchPage` is `(cursor?) => Promise<{items: T[], hasMore: boolean, nextCursor: string|null}>`. Loop: pass cursor, collect items, stop when `hasMore === false` or limit reached. Trim to limit if needed.
- `options` type: `{ limit?: number }`. When undefined, fetch all.
- Both return `T[]` (flat array of all collected items).
- The caller wraps the action call in a lambda matching the `fetchPage` signature, mapping action return shapes. For get-messages: `{ items: result.messages, hasMore: result.has_more, nextCursor: result.next_cursor }`.
- **get-messages output wrapping**: The get-messages command outputs a wrapper object `{conversation_id, participant_name, participant_linkedin_id, messages: [...]}` instead of a bare array. Metadata is captured from the first page response. This matches MCP tool parity and gives callers conversation context.

**Patterns to follow:**
- `src/lib/kanbox-client.ts` — lib module structure, named exports

**Test scenarios:**
- Happy path: offset paginator fetches 3 pages of 100 items (count=250), returns all 250
- Happy path: cursor paginator fetches 2 pages (hasMore=true then false), returns all items
- Happy path: offset paginator with limit=50 fetches 1 page, trims to 50
- Happy path: cursor paginator with limit=10 on a 25-item first page, returns 10
- Edge case: offset paginator with empty first page (count=0), returns []
- Edge case: cursor paginator with hasMore=false on first call, returns single page
- Edge case: limit larger than total results, returns all without error
- Edge case: limit=1, returns exactly 1 item from first page
- Edge case: offset paginator stops if page returns 0 items (infinite-loop guard)

**Verification:**
- All Unit 2 tests pass (were red, now green)
- Paginators correctly stop at limit boundary
- Paginators handle empty result sets and defensive guards

- [ ] **Unit 3: Command implementations**

**Goal:** Wire up all 4 CLI commands with parseArgs, Zod validation, pagination helpers, and JSON output to stdout.

**Requirements:** R4, R6, R7, R8, R9, R12

**Dependencies:** Unit 1, Unit 2

**Execution note:** Test-first. Write failing tests for each command's arg parsing, param construction, and output shape before implementing the command handlers.

**Files:**
- Test: `test/cli.test.ts` (extend with command-level tests — write first)
- Modify: `src/cli.ts` (replace stubs with real command handlers)

**Approach:**

*Red phase* — Extend `test/cli.test.ts` with tests for each command. Tests mock `KanboxClient.get` (same pattern as existing action tests) and verify: correct params passed to action, correct JSON on stdout, correct error handling. All new tests fail because stubs return `[]`.

*Green phase* — Replace stubs in `src/cli.ts`:
- Each command function: parse flags with `parseArgs`, construct action params object, validate with existing Zod schema (e.g., `searchMembersSchema.parse(params)`), wrap action in fetchPage lambda, call paginator, `JSON.stringify` result to stdout.
- `search-members`: `parseArgs` with options `q` (string), `linkedin-public-ids` (string, split on comma), `type` (string), `pipeline-name` (string), `step-title` (string), `updated-since` (string), `limit` (string, parseInt). Call `paginateOffset` wrapping `searchMembers`.
- `get-messages`: `parseArgs` with `allowPositionals: true`, first positional is conversation_id (parseInt, with NaN guard — exit 1 with clear error if non-numeric). Option: `limit` (string, parseInt). Call `paginateCursor` wrapping `getMessages`, mapping `messages` to `items` and `has_more`/`next_cursor` to `hasMore`/`nextCursor`. After pagination, wrap result: `{conversation_id, participant_name, participant_linkedin_id, messages}` using metadata from first page response.
- `search-leads`: `parseArgs` with options `q` (string), `name` (string), `limit` (string, parseInt). Call `paginateOffset` wrapping `searchLeads`.
- `list-lists`: `parseArgs` with options `limit` (string, parseInt). Call `paginateOffset` wrapping `listLists`.
- Error handling: wrap each command in try/catch. `KanboxApiError` → stderr message with status and body, exit 1. Generic `Error` → stderr message, exit 1. `ZodError` → stderr validation message, exit 1.
- Flag-to-param mapping: simple object literal per command, e.g., `{ q: values.q, linkedin_public_ids: values['linkedin-public-ids']?.split(','), ... }`. Only include defined values.

**Patterns to follow:**
- `src/tools/kanbox-read.ts` — action dispatch pattern (switch on command name)
- `src/actions/search-members.ts` — param shape to construct

**Test scenarios:**
- Happy path: `search-members --q "Herzog"` calls searchMembers with `{q: "Herzog", limit: 100, offset: 0}` and outputs JSON array to stdout
- Happy path: `get-messages 6925049` calls getMessages with `{conversation_id: 6925049}` and outputs wrapped object with conversation metadata + paginated messages
- Happy path: `search-leads --q "test" --name "My List"` passes both filters
- Happy path: `list-lists` with no args fetches all lists
- Happy path: `search-members --limit 5` returns exactly 5 items
- Happy path: `search-members --linkedin-public-ids "abc,def,ghi"` splits to array `["abc","def","ghi"]`
- Happy path: `search-members --pipeline-name "Sales" --step-title "Contacted"` passes pipeline filters
- Happy path: `search-members --updated-since "2026-01-01T00:00:00Z"` passes ISO timestamp
- Error path: `get-messages` with no conversation ID prints error to stderr, exits 1
- Error path: API returns 401 → stderr error message with status, exits 1
- Error path: API returns 500 mid-pagination → stderr error, exits 1, no partial stdout
- Edge case: `get-messages abc` (non-numeric ID) → error to stderr, exits 1

**Verification:**
- All Unit 3 tests pass (were red, now green)
- `--limit` correctly caps results across all commands
- Errors never produce partial JSON on stdout
- Exit codes are correct (0 success, 1 error)

- [ ] **Unit 4: Integration smoke test**

**Goal:** End-to-end test that the built CLI binary works as a subprocess with a real HTTP server.

**Requirements:** Success criteria validation

**Dependencies:** Unit 3

**Execution note:** Test-first. Write the integration test expectations first, then verify they pass against the built binary.

**Files:**
- Test: `test/cli-integration.test.ts` (write first, then build and run)

**Approach:**

*Red phase* — Write `test/cli-integration.test.ts`:
- Spin up a local HTTP server in vitest `beforeAll` that returns canned API responses for each endpoint
- Use `child_process.execFile` to invoke `node dist/cli.js` as a subprocess with `KANBOX_BASE_URL` pointing to the local server and `KANBOX_API_TOKEN` set
- Tests assert stdout is valid JSON, stderr is empty on success, exit code 0
- Tests fail initially because `dist/cli.js` must be built first

*Green phase* — Run `npm run build`, then run the integration tests. All should pass given Units 1-3 are complete. Fix any wiring issues (KANBOX_BASE_URL passthrough, etc.).

**Patterns to follow:**
- `test/tools/kanbox-read.test.ts` — integration test structure with mocked client

**Test scenarios:**
- Happy path: `kanbox search-members --q "test"` returns valid JSON array to stdout, exit 0
- Happy path: `kanbox get-messages 123` returns valid JSON with conversation metadata + messages, exit 0
- Happy path: stdout output parses as JSON and items match expected normalized shape
- Error path: missing KANBOX_API_TOKEN → exit 1, stderr contains "KANBOX_API_TOKEN"
- Error path: invalid command → exit 1, stderr contains usage hint

**Verification:**
- All integration tests pass (were red, now green)
- `npm run build && node dist/cli.js --help` works end-to-end

## System-Wide Impact

- **Interaction graph:** The CLI calls the same action functions as the MCP tool dispatchers. No callbacks, middleware, or observers are affected. The two entry points share code but have independent execution paths.
- **Error propagation:** Actions throw `KanboxApiError` or generic errors. MCP tools catch these via `formatError` → `CallToolResult`. CLI catches via try/catch → `console.error` → `process.exit(1)`. The two error paths are independent.
- **API surface parity:** CLI exposes all MCP read action parameters as CLI flags. Future MCP parameter additions should be mirrored in CLI flags.
- **Unchanged invariants:** MCP server behavior is completely unchanged. The `src/index.ts` entry point, all tool dispatchers, and the MCP transport layer are not modified. The only shared-file change is `package.json` (bin field).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Auto-pagination on large datasets causes high memory usage | Buffered approach is fine for current scale (~500 contacts). Add JSON Lines streaming in a future iteration if datasets grow significantly. |
| Offset-based pagination may duplicate/skip items if data changes mid-fetch | Acceptable for a CRM with relatively stable data. Document as known limitation. |
| `node:util` parseArgs not available on older Node | Require Node 18.3+ in `package.json` engines field. |
| Kanbox API rate limits during tight pagination loops | Scope boundary: no rate limiting in v1. The existing 30s per-request timeout in KanboxClient provides a natural floor. Add backoff if rate limits are hit in practice. |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-02-cli-entry-point-requirements.md](docs/brainstorms/2026-04-02-cli-entry-point-requirements.md)
- Related code: `src/index.ts` (entry point pattern), `src/tools/kanbox-read.ts` (dispatch pattern), `src/lib/kanbox-client.ts` (client API)
- Institutional learnings: `docs/solutions/code-quality/mcp-server-code-review-hardening.md`, `docs/solutions/integration-issues/kanbox-mcp-api-field-mapping.md`
- Node.js docs: `node:util` `parseArgs` API (Node 18.3+)
