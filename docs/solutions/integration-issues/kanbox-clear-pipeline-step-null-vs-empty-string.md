---
title: "Kanbox MCP: clearing pipeline/step needs empty string, not null"
date: 2026-09-21
category: integration-issues
module: src/actions
problem_type: integration_issue
component: kanbox-mcp
symptoms:
  - "update_member cannot un-stage a member: pipeline/step stay set after the call"
  - "Sending pipeline/step as null returns 202 but the assignment is unchanged (silent no-op)"
  - "Zod rejects pipeline/step: null with a validation error under z.string().optional()"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags:
  - kanbox
  - mcp
  - typescript
  - api-integration
  - zod
  - pipeline
  - empty-string
  - nullable
related_components:
  - src/actions/update-member.ts
  - src/tools/kanbox-write.ts
---

# Kanbox MCP: clearing pipeline/step needs empty string, not null

## Problem

`update_member` could stage a contact on a KanBox pipeline (set `pipeline` +
`step`) but had no way to **un-stage** it. Clearing the assignment through the
MCP was impossible: the Zod schema typed `pipeline`/`step` as
`z.string().optional()`, which rejects `null`, and even a forwarded `null` is a
silent no-op on the KanBox backend.

## Symptoms

- An agent parks contacts on a pipeline stage, the coach runs a bulk action in
  the KanBox UI, but nothing can un-park them programmatically afterward.
- `PATCH /public/members/{id}` with `{"pipeline": null}` returns `202 Accepted`
  yet the pipeline stays assigned on the next read.
- `kanbox_write update_member` with `pipeline: null` fails Zod validation
  ("Invalid parameters") before a request is ever built.

## What Didn't Work

- **Sending `null`.** The natural JSON "clear" value. The KanBox OpenAPI schema
  even permits it — `MemberIn.pipeline` and `MemberIn.step` are each
  `anyOf: [{type: string}, {type: null}]` at
  `https://api.kanbox.io/openapi.json`. But the backend treats `null` as
  "field not provided" and no-ops. The OpenAPI type is more permissive than the
  server's actual behavior.
- **Relying on `z.string().optional()` to pass `""`.** Empty string does pass
  that schema and does clear, but nothing signalled `""` as the clear sentinel,
  and an agent reaching for `null` hit a validation wall first.

## Solution

Accept an explicit clear — `""` **or** `null` — and normalize it to the `""`
the API actually acts on, at the action boundary.

Schema (`src/actions/update-member.ts`): widen the two fields to nullable and
document the clear.

```ts
pipeline: z
  .string()
  .nullable()
  .describe('Pipeline name to assign; pass "" or null to un-stage (clear the pipeline)')
  .optional(),
step: z
  .string()
  .nullable()
  .describe('Pipeline step to assign; pass "" or null to clear the step')
  .optional(),
```

Action (`src/actions/update-member.ts`): coerce `null -> ""` for those two
fields only, after destructuring and before the PATCH.

```ts
const { id, ...body } = params;
// KanBox unsets a pipeline/step only on "" — null is a silent no-op — so
// normalize an explicit clear (null) to the empty string the API acts on.
for (const key of ["pipeline", "step"] as const) {
  if (body[key] === null) body[key] = "";
}
const { status } = await client.patch(`/public/members/${id}`, body);
```

Four field states, all preserved:

| Caller sends | PATCH body | Effect |
|---|---|---|
| `pipeline: "Outreach"` | `pipeline: "Outreach"` | assign (park) |
| `pipeline: ""` | `pipeline: ""` | clear (un-park) |
| `pipeline: null` | `pipeline: ""` | clear (un-park) |
| omitted | key absent | unchanged (partial update) |

The tool description in `src/tools/kanbox-write.ts` documents all three idioms,
including that omitting the fields leaves the assignment unchanged — necessary
because `kanbox_write` exposes `params` as `z.record(z.unknown())`, so the
per-field `.describe()` text never reaches the consuming agent; the tool
`DESCRIPTION` string is the only contract an agent sees.

## Why This Works

The coercion lives where the API quirk is known — the action boundary, just
before `client.patch` — not in the Zod schema. `JSON.stringify` (in
`kanbox-client.ts`'s `patch`) keeps `""` and `null` but drops `undefined`
keys, so coercing only `null -> ""` leaves omitted fields absent (partial
update intact), passes `""` through, and forwards non-empty values verbatim.
Scoping the loop to the `["pipeline", "step"]` tuple keeps every other field
untouched.

## Prevention

- **When a write field must support "clear", verify the sentinel against the
  live API, not the OpenAPI schema.** A field typed `string | null` may still
  clear only on `""`. The spec is the contract for *shape*, not always for
  *semantics*.
- **Put API-specific value coercions at the action boundary, not in Zod.** The
  schema should describe accepted input (`string | null | absent`); the
  backend-quirk mapping (`null -> ""`) belongs next to the `client.*` call.
  Same convention as
  [kanbox-action-control-params-leak-to-api-query.md](./kanbox-action-control-params-leak-to-api-query.md).
- **Cover the schema gate, not just the handler.** Unit tests that call the
  action function directly bypass `updateMemberSchema.parse`, so a `.nullable()`
  change can have zero executable coverage — reverting it would keep those tests
  green while breaking real MCP `null` calls. Add a dispatcher-level test
  (`test/tools/kanbox-write.test.ts`) that calls `kanbox_write update_member`
  with `pipeline: null` and asserts the wire body is `pipeline: ""`.

## Related Issues

- [kanbox-action-control-params-leak-to-api-query.md](./kanbox-action-control-params-leak-to-api-query.md)
  — the action-boundary parameter-handling convention this fix follows.
- [kanbox-mcp-api-field-mapping.md](./kanbox-mcp-api-field-mapping.md) — the
  read vs. write field-name split: reads expose `board`/`step_name`, writes use
  `pipeline`/`step`. This fix touches only the write path.
- Plan: `docs/plans/2026-09-21-001-feat-update-member-clear-pipeline-step-plan.md`
- Kanbox OpenAPI spec: `https://api.kanbox.io/openapi.json`
