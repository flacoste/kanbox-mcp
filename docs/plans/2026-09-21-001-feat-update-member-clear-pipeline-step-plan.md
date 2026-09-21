---
title: Let update_member clear pipeline/step (un-park the refresh workflow)
date: 2026-09-21
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
status: ready
---

# Let `update_member` Clear pipeline/step (Un-park the Refresh Workflow)

## Goal Capsule

- **Objective:** An agent can un-park a contact — remove its KanBox pipeline/step
  assignment — through `kanbox_write` `update_member`, the same tool it uses to park
  one. After the call, `GET`-ing the member shows no pipeline/step.
- **Means:** Accept an explicit clear signal (`""` **or** `null`) on the `pipeline`
  and `step` params and forward the empty string `""` to `PATCH /public/members/{id}`
  (KTD1, KTD2).
- **Authority hierarchy:** User's stated API behavior > this plan. The load-bearing
  fact — KanBox unsets a pipeline only on `""`, treats `null` as a silent no-op — is
  the user's empirical report and governs the design even though the OpenAPI schema
  types the fields as nullable (see Planning Contract → Evidence).
- **Stop conditions:** Done when U1–U2 land and the Verification Contract passes. Do
  **not** extend clearing to other fields or to `add_lead` (Scope Boundaries).

## Product Contract

### Summary

The refresh-contacts freshness loop parks a batch of contacts on a KanBox pipeline
stage via `update_member` (setting `pipeline` + `step`); the coach then runs that
stage's bulk "update profiles" action in the KanBox UI. Un-parking afterward is
currently impossible through the MCP: KanBox unsets a pipeline only when `pipeline`/
`step` are sent as the empty string `""`, while `null` is a silent no-op — but the
`update_member` action forwards params verbatim and the Zod schema
(`z.string().optional()`) rejects `null`, so a caller has no reliable way to express
"clear this field."

This plan lets `update_member` accept an explicit clear — `""` or `null` — on
`pipeline` and `step`, normalizing either to the `""` that KanBox actually acts on,
so an agent can both stage and un-stage contacts programmatically.

### Problem Frame

`src/actions/update-member.ts` destructures `{ id, ...body }` and forwards `body`
straight to `client.patch`. Two facts combine to block un-parking:

1. **Zod rejects `null`.** `pipeline`/`step` are `z.string().optional()`. `.optional()`
   permits `undefined` (absent → not forwarded), not `null`. An agent that reaches for
   the natural JSON "clear" value (`null`) gets a validation error before the request
   is built.
2. **KanBox ignores `null` even if it reached the API.** Per the user's live
   observation, the backend clears a pipeline **only** on `""`; a JSON `null` is a
   silent no-op. So even a schema that accepted `null` would forward a value the API
   ignores.

Empty string is not a robust escape hatch today either: nothing in the tool
description or schema signals that `""` is the clear sentinel, so callers do not know
to use it. The fix makes the clear intent explicit and maps every form of it to the
one value the API honors.

### Requirements

- **R1** — `update_member` accepts `pipeline: ""` and `step: ""` and forwards each as
  `""` in the `PATCH /public/members/{id}` body (clear).
- **R2** — `update_member` accepts `pipeline: null` and `step: null` (no Zod
  rejection) and forwards each as `""` in the PATCH body (clear). `null` is normalized
  to `""` because the API no-ops on `null`.
- **R3** — Omitting `pipeline`/`step` (absent/`undefined`) leaves them out of the PATCH
  body entirely — partial-update semantics for every field are unchanged.
- **R4** — A non-empty `pipeline`/`step` value is forwarded verbatim (park path
  unchanged).
- **R5** — The `kanbox_write` tool description documents that `""`/`null` clears
  pipeline/step, so an agent knows the un-park primitive exists.
- **R6** — No other field (`email`, `phone`, `custom`, `icebreaker`, `labels`) changes
  behavior, and `add_lead` is untouched.

### Key Decisions

- **Clear signal is `""` OR `null`, both normalized to `""`** (session-settled with
  user). Governs R1, R2. Rationale: `null` is the natural JSON clear value an agent
  reaches for; `""` is what the API honors. Accept both, forward what works.
- **Scope limited to `pipeline`/`step` on `update_member`.** Governs R6. Rationale:
  the un-park workflow needs only these two fields; widening clear-semantics to other
  fields or to the lead-creation path is unrequested surface.

### Scope Boundaries

- **In:** `pipeline`/`step` clear on `update_member`; tool-description doc update;
  tests.
- **Out (non-goals):**
  - Clearing `email`/`phone`/`custom`/`icebreaker`/`labels` — not requested, and
    `labels` already has full-replacement semantics (send `[]` to clear).
  - `add_lead`'s `pipeline`/`step` — that is a create/enrich path, not un-parking.
  - The refresh-contacts freshness loop and the coach's bulk UI action — external
    consumers of this primitive, not code in this repo.

## Planning Contract

### Evidence (load-bearing)

- **KanBox OpenAPI** (`https://api.kanbox.io/openapi.json`, verified 2026-09-21):
  `PATCH /public/members/{id}` bodies use `MemberIn`, whose `pipeline` and `step` are
  each `anyOf: [{type: string}, {type: null}]` — the schema *permits* `null`.
- **Backend behavior** (user's empirical report, authoritative): despite the schema,
  the server clears a pipeline only on `""`; `null` is a silent no-op. This is why the
  design normalizes `null → ""` rather than forwarding `null`. This mismatch (schema
  says nullable, backend acts only on empty string) is the crux of the bug and belongs
  in `docs/solutions/` once shipped (see Definition of Done).
- **Write field names:** the action already forwards `pipeline`/`step` as the PATCH
  body keys (they are the `MemberIn` property names). This is the *write* contract and
  is distinct from the *read* normalization, where the raw record exposes `board`
  (int) and `step_name` — see `docs/solutions/integration-issues/kanbox-mcp-api-field-mapping.md`.
  No read-path change here.

### Key Technical Decisions

- **KTD1 — Make the fields nullable in Zod, not merely non-empty.** Change
  `pipeline`/`step` from `z.string().optional()` to `z.string().nullable().optional()`
  in `updateMemberSchema`. `.optional()` alone still rejects `null`; adding
  `.nullable()` lets the clear intent through. Empty string already parses under
  `z.string()`, so no `.min()` needs removing (there is none today). Governs R1, R2.
- **KTD2 — Normalize `null → ""` in the action, not the schema.** Keep the schema a
  faithful description of accepted input (string | null | absent) and do the
  value-mapping in `updateMember` just before the PATCH, coercing `pipeline`/`step`
  from `null` to `""`. Rationale: the coercion is a KanBox-API quirk, so it lives at
  the API-call boundary where the quirk is; a Zod `.transform` would hide an
  API-specific workaround inside the input contract. Absent fields stay absent
  (`undefined` is never coerced). Governs R2, R3.
- **KTD3 — Coerce only `pipeline`/`step`.** Iterate exactly those two keys; do not
  blanket-coerce every field, so other string fields keep their current behavior.
  Governs R6.

### High-Level Design

Two touch points, one file plus the tool description:

- **Schema** (`src/actions/update-member.ts`): `pipeline`/`step` become
  `z.string().nullable().optional()` with `.describe()` text that names the clear
  behavior.
- **Action** (`src/actions/update-member.ts`): after `const { id, ...body } = params`,
  coerce `body.pipeline`/`body.step` from `null` to `""`. Absent keys are not present
  on `body`, so they are untouched; `""` passes through; non-empty passes through.
- **Tool description** (`src/tools/kanbox-write.ts`): extend the `update_member` line
  so an agent reads that `""`/`null` un-parks.

Directional sketch (final form decided at implementation):

```ts
// schema
pipeline: z.string().nullable().describe(
  'Pipeline name to assign; pass "" or null to un-stage (clear the pipeline)',
).optional(),
step: z.string().nullable().describe(
  'Pipeline step to assign; pass "" or null to clear the step',
).optional(),

// action
const { id, ...body } = params;
for (const key of ["pipeline", "step"] as const) {
  if (body[key] === null) body[key] = "";
}
const { status } = await client.patch(`/public/members/${id}`, body);
```

## Implementation Units

### U1. Accept and forward the clear on `pipeline`/`step`

- **Goal:** `update_member` accepts `""`/`null` for `pipeline`/`step` and forwards
  `""` to PATCH; park and partial-update paths unchanged.
- **Requirements:** R1, R2, R3, R4, R6.
- **Files:** `src/actions/update-member.ts`.
- **Approach:**
  1. In `updateMemberSchema`, change `pipeline` and `step` to
     `z.string().nullable().optional()` and update their `.describe()` text to name the
     `""`/`null` clear behavior (KTD1).
  2. In `updateMember`, after destructuring `{ id, ...body }`, coerce `body.pipeline`
     and `body.step` from `null` to `""` before calling `client.patch` (KTD2, KTD3).
     Leave all other fields, and absent pipeline/step, untouched.
- **Test scenarios** (in `test/actions/update-member.test.ts`, matching the existing
  `patchSpy` style):
  - `pipeline: ""`, `step: ""` → PATCH body contains `pipeline: ""`, `step: ""` (R1).
  - `pipeline: null`, `step: null` → PATCH body contains `pipeline: ""`, `step: ""`
    (R2, the crux — proves the `null → ""` normalization).
  - Only `email` set (no pipeline/step) → PATCH body has no `pipeline`/`step` keys
    (R3).
  - `pipeline: "Outreach", step: "Follow-up"` → forwarded verbatim (R4).
- **Verification:** `npm test` green; `npm run build` clean (the `nullable()` type
  change compiles).

### U2. Document the un-park primitive in the tool description

- **Goal:** An agent reading `kanbox_write` learns that `""`/`null` clears
  pipeline/step.
- **Requirements:** R5.
- **Files:** `src/tools/kanbox-write.ts` (the `DESCRIPTION` `update_member` line).
- **Approach:** Extend the `update_member` bullet to note that `pipeline`/`step`
  accept `""` or `null` to un-stage (clear) the assignment. Keep it one clause; do not
  restructure the description.
- **Test scenarios:** Covered by the existing `kanbox-write.test.ts` assertion that the
  description contains `update_member`; no new description-substring test — asserting
  exact wording would pin prose, not behavior. If a new assertion is added at all, it
  checks that a clear call dispatches (behavioral), not the wording.
- **Verification:** `npm test` green; manual read of the description confirms the clause
  is present and accurate.

## Verification Contract

- `npm run build` — TypeScript compiles with the `nullable()` schema change (no
  `tsc` errors).
- `npm test` — full Vitest suite green, including the new U1 cases in
  `test/actions/update-member.test.ts`.
- **Behavioral proof of the crux:** the `pipeline: null → ""` and `pipeline: "" → ""`
  assertions on `patchSpy` demonstrate R1/R2 without a live API call (the existing
  tests already stub `client.patch`).
- **Optional live smoke (not gating):** if a real `KANBOX_API_TOKEN` is available,
  park a member (`pipeline`/`step` set), then clear (`pipeline: ""`), then
  `search_members` and confirm the pipeline/step read back empty. Not required for
  merge; the stubbed tests are the contract proof.

## Definition of Done

- **Global:**
  - R1–R6 satisfied; Verification Contract passes (`npm run build` + `npm test`).
  - Un-parking works end-to-end through `update_member`: `""` and `null` both forward
    `""`; absent fields stay absent; non-empty fields forward verbatim.
- **Per unit:**
  - U1 — schema is `nullable().optional()`, action coerces `null → ""` for
    pipeline/step only, four test scenarios pass.
  - U2 — tool description names the `""`/`null` clear behavior for pipeline/step.
- **Cleanup:**
  - No stray coercion of unrelated fields; no `add_lead` changes; no debug
    `console.*` (stdout is JSON-RPC transport).
  - **Recommended (not gating):** capture the schema-nullable-vs-backend-empty-string
    quirk as a `docs/solutions/integration-issues/` entry (via `ce-compound`) so the
    next person mapping a KanBox clear does not re-derive that `null` is a no-op.
