---
title: "Kanbox MCP: action control-params leak into the upstream API query"
date: 2026-09-16
category: integration-issues
problem_type: convention
module: src/actions
component: kanbox-mcp
severity: medium
applies_when:
  - "Adding a new param to a kanbox action's Zod schema that controls the tool's own output or behavior rather than filtering the upstream API"
  - "Adding an output-shaping flag (verbosity, includes, format) to search_members or any other action"
  - "Mirroring such a param in the CLI wrapper (src/cli.ts)"
root_cause: wrong_api
tags:
  - kanbox
  - mcp
  - typescript
  - api-integration
  - zod
  - query-params
  - action-pattern
related_components:
  - src/actions/search-members.ts
  - src/lib/normalize.ts
  - src/cli.ts
---

# Kanbox MCP: action control-params leak into the upstream API query

## Context

Every action in this server forwards its validated Zod params **verbatim** to the
HTTP client as the upstream query string. `searchMembers` is the canonical shape:

```typescript
// src/actions/search-members.ts (pattern)
export async function searchMembers(client, params: SearchMembersParams) {
  const { data } = await client.get("/public/members", params as Record<string, unknown>);
  // ...
}
```

Every field on `searchMembersSchema` was, until now, an upstream **filter**
(`q`, `type`, `pipeline_name`, `step_title`, `linkedin_public_ids`,
`updated_since`, `limit`, `offset`) — so passing the whole `params` object
through as query params was correct.

Adding `include_history` (an opt-in flag that shapes the tool's *own* output —
whether the normalizer emits position-history fields) broke that assumption. It
is **not** a `/public/members` query parameter. Left in `params`, it would have
been serialized into the request to Kanbox as `?include_history=true`.

## Guidance

When you add a param to an action's Zod schema that controls the tool's own
behavior or output rather than filtering the upstream API, **destructure it out
of `params` before the `client.get`/`post`/`patch` call** and route it to
wherever it actually belongs (the normalizer, the paginator, formatting, etc.).

```typescript
// src/actions/search-members.ts:28-37 (current)
const { include_history, ...query } = params;          // strip the control flag
const { data } = await client.get<{ items: unknown[]; count: number }>(
  "/public/members",
  query as Record<string, unknown>,                    // only real filters go upstream
);
return {
  items: ((data.items ?? []) as Record<string, unknown>[]).map((m) =>
    normalizeMember(m, include_history ?? false),      // control flag routed to the normalizer
  ),
  count: data.count ?? 0,
};
```

The CLI wrapper forwards the same params object, so it inherits the fix for free
— it only needs to *populate* the flag, and the action's destructure still
strips it before the HTTP call:

```typescript
// src/cli.ts:104 — parseArgs option
"include-history": { type: "boolean" },
// src/cli.ts:118 — mapped into params (stripUndefined drops it when unset)
include_history: values["include-history"] === true ? true : undefined,
```

## Why This Matters

The forwarding is silent and verbatim (`query as Record<string, unknown>` →
`client.get`, `src/actions/search-members.ts:31`). A stray unknown query param
does not throw locally: Zod validation passes, `tsc` passes, and any test that
does not assert the *outgoing* query still passes. Depending on the upstream, a
leaked param is ignored, rejected with a 4xx, or — worst — silently changes the
result set. The failure only surfaces against the live API.

Guard it with a test that asserts the flag never reaches the client:

```typescript
// test/actions/search-members.test.ts
it("strips include_history from the API query params", async () => {
  await searchMembers(client, { q: "jane", include_history: true });
  expect(getSpy).toHaveBeenCalledWith("/public/members", { q: "jane" });
});
```

Related design note from the same change: history is **opt-in** because it is
expensive in tokens. A confirmed live probe showed `past_positions` runs 0–23
role objects per contact; a `limit=100` search with history can roughly double
the ~27k-token response. Gating verbose, variable-size data behind a default-off
flag (fields **absent**, not `null`, so the default output stays byte-for-byte
identical — `src/lib/normalize.ts`) keeps bulk reads lean while the data stays
available on demand. The control-param-strip rule is what makes such flags
possible without polluting the upstream request.

## When to Apply

- Any new **non-filter** param on a kanbox action schema (output verbosity,
  includes, format, pagination controls the API doesn't accept).
- Apply in **both** places the param appears: the action function (strip before
  `client.*`) and the CLI handler (`src/cli.ts`), which shares the same
  params-passthrough path.
- Filter params that the API *does* accept stay in `query` — the distinction is
  filter-vs-control, not new-vs-old.

## Examples

Before (control flag would leak):

```typescript
const { data } = await client.get("/public/members", params); // include_history → ?include_history=true
```

After (control flag stripped and routed):

```typescript
const { include_history, ...query } = params;
const { data } = await client.get("/public/members", query);
// ...normalizeMember(m, include_history ?? false)
```

## Related Documentation

- **Sibling API learning:** [kanbox-mcp-api-field-mapping.md](./kanbox-mcp-api-field-mapping.md)
  — response-shape mismatches in the same actions/normalizer layer (distinct
  root cause: wrong field names vs. this doc's param passthrough).
- **Implementation plan:** [docs/plans/2026-09-15-001-feat-linkedin-position-history-plan.md](../../plans/2026-09-15-001-feat-linkedin-position-history-plan.md)
- **Conventions:** [CLAUDE.md](../../../CLAUDE.md) — dispatcher pattern, one file per action.
