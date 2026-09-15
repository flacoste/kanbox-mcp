---
title: Expose LinkedIn position history in kanbox_read (opt-in)
date: 2026-09-15
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
status: ready
---

# Expose LinkedIn Position History in kanbox_read (Opt-In)

## Summary

`normalizeMember` (`src/lib/normalize.ts`) narrows each raw KanBox member/lead
record into `NormalizedMember`, which today carries only the **current** position
(`headline`, `company`, `job`, `location`, plus `company_headcount`,
`company_linkedin_url`, `company_website`). It drops the employment-history fields
the raw API (`LeadOut` on `/public/members`) returns.

Add the history fields so a consumer can reconstruct multiple job changes for a
long-stale contact instead of seeing only their latest role:

- `past_positions` — prior roles (shape to be confirmed live; see U1)
- `years_of_experience`
- `year_position`, `month_position`, `startyear_position`, `startmonth_position`

**Exposure decision (settled with user): opt-in extended schema.** All six fields
are gated behind a single `include_history` flag on `search_members`, default
`false`. When the flag is absent or `false`, `search_members` output is
**byte-for-byte identical to today**. This keeps bulk searches lean while making
full history available on demand.

## Token Impact Assessment (basis for the exposure decision)

Measured on a representative normalized member, serialized exactly as
`formatResult` emits it (`JSON.stringify(data)`, compact, no whitespace),
estimated at ~4 bytes/token for dense JSON.

| Payload | Per member | Per 100-member `search_members` |
|---|---|---|
| Base member (current shape) | ~272 tk | ~27,200 tk |
| + scalar/date fields only (`years_of_experience`, 4 `*_position`) | +29 tk (+11%) | +~2,900 tk |
| + `past_positions` (3 prior roles) | +116 tk (+43%) | +~14,500 tk |
| + `past_positions` (6 prior roles) | +227 tk (+83%) | +~25,600 tk |

**Reading:** the five scalar/date fields are cheap. `past_positions` is the cost
driver — on a full search (`limit=100`) it adds roughly half to nearly a full
extra response. The target use case (long-stale contacts) skews toward *more*
history per record, so the 6-role row is the realistic worst case. `search_members`
(`/public/members` → `normalizeMember`) is the **only** member read path — there is
no separate member-detail endpoint — so anything `normalizeMember` emits
unconditionally lands on every bulk search. Gating all six fields behind one flag
holds the default-path cost at exactly 0 and confines the growth to calls that
explicitly ask for it.

## Two Live-API Verifications (resolve in U1 before coding U2/U3)

Raw field names/shape were observed via a live-API probe, not repo types. Confirm
against a real response before mapping:

1. **`past_positions` shape** — single object vs. array of prior roles, and the
   per-entry field names (title, company, and the date fields). The mapper in U2
   depends on this.
2. **Presence on the search path** — that all six fields appear on the
   `/public/members` response used by `search_members` (the vault queries by
   `linkedin_public_ids`), not only on a detail endpoint. Structurally there is
   only one member path, but confirm the fields are actually populated in that
   payload.

Also confirm **nesting**: current position fields are read from `raw.lead.*`
(e.g. `lead.headline`, `lead.job`). The history fields are expected on `lead.*`
too (`lead.past_positions`, `lead.year_position`, …). Confirm whether any sit at
the top-level `raw.*` instead.

## Implementation Units

### U1 — Verify raw shape against live API `[verification, gates U2/U3]`

**Files:** none (investigation; may add a throwaway probe script, not committed)

Run the server or a throwaway probe against the live API with a real
`KANBOX_API_TOKEN` (`.env`) and capture one raw `/public/members` item for a
contact known to have job history (ideally queried by `linkedin_public_ids`, the
vault's path).

- `npm run dev` exposes the stdio server; simplest is a short throwaway script that
  imports `KanboxClient`, calls `client.get("/public/members", { linkedin_public_ids: ["<slug>"] })`,
  and `console.error(JSON.stringify(item, null, 2))` for one item. (`console.error`,
  never `console.log` — stdout is the JSON-RPC transport.)
- Record, for the raw item:
  - exact keys and nesting for `years_of_experience`, `year_position`,
    `month_position`, `startyear_position`, `startmonth_position`
  - `past_positions`: array vs. object, and each entry's keys (role title, company,
    start/end date fields)
- Delete the probe script (`command rm -f`) once the shapes are recorded.

**Acceptance:** the exact source key + nesting for all six fields and the
`past_positions` per-entry shape are known and written into U2's mapping below,
reconciling any divergence from the assumptions in this plan.

### U2 — Add history fields to `NormalizedMember` + `normalizeMember`

**File:** `src/lib/normalize.ts`

1. Add a `PastPosition` interface for a normalized prior role. Target compact shape
   (adjust names to the U1-confirmed source keys; omit a target field that has no
   source, extend if the source carries an additional useful role field):

   ```ts
   export interface PastPosition {
     title: string | null;
     company: string | null;
     startyear: number | null;
     startmonth: number | null;
     endyear: number | null;
     endmonth: number | null;
   }
   ```

2. Add the history fields to `NormalizedMember` as **optional** properties (present
   only when history is requested, so the default shape is unchanged):

   ```ts
   years_of_experience?: number | null;
   year_position?: number | null;
   month_position?: number | null;
   startyear_position?: number | null;
   startmonth_position?: number | null;
   past_positions?: PastPosition[];
   ```

3. Change the signature to `normalizeMember(raw, includeHistory = false)`. Keep the
   existing return object exactly as-is; when `includeHistory` is true, add the six
   fields (read from `lead.*` per U1, `?? null` for scalars, `?? []` mapped to
   `PastPosition` for the array). Do **not** set the keys at all when
   `includeHistory` is false — absence, not `null`, preserves the byte-for-byte
   default output.

**Invariant:** with `includeHistory` omitted/false, `normalizeMember` output is
identical to today. Existing callers that pass one argument keep the current shape.

**Acceptance:** `normalizeMember(raw)` and `normalizeMember(raw, false)` produce no
history keys; `normalizeMember(raw, true)` produces all six, with `past_positions`
as an array of `PastPosition`.

### U3 — Add `include_history` flag to `search_members`

**Files:** `src/actions/search-members.ts`, `src/tools/kanbox-read.ts`

1. `searchMembersSchema`: add
   `include_history: z.boolean().describe("Include LinkedIn position history (past_positions, years_of_experience, position dates). Default false — off keeps output compact.").optional()`.

2. In `searchMembers`, **destructure the flag out of the API query** so it is never
   forwarded to KanBox, then pass it to the mapper:

   ```ts
   const { include_history, ...query } = params;
   const { data } = await client.get<{ items: unknown[]; count: number }>(
     "/public/members",
     query as Record<string, unknown>,
   );
   return {
     items: ((data.items ?? []) as Record<string, unknown>[])
       .map((m) => normalizeMember(m, include_history ?? false)),
     count: data.count ?? 0,
   };
   ```

3. Update the `search_members` line in `kanbox-read.ts` `DESCRIPTION` to document
   `include_history` (opt-in, default off, what it adds).

**Acceptance:** `include_history` never appears in the `/public/members` query
string; `include_history: true` returns members with history fields;
omitted/`false` returns the current shape.

### U4 — Tests + rebuild `dist/`

**Files:** `test/lib/normalize.test.ts`, `test/actions/search-members.test.ts`
(if present; otherwise co-locate the query-strip assertion), then `npm run build`

Add only tests that would fail on a plausible bug:

- **normalize:** with `include_history: true`, history fields are present and
  `past_positions` is a `PastPosition[]`; with the flag omitted **and** with it
  `false`, the result has none of the six keys (`not.toHaveProperty`) — this pins
  the byte-for-byte default invariant.
- **search-members:** `include_history` is stripped from the outbound query params
  (assert against the mocked client's captured params/URL — the existing client
  test harness in `test/lib/kanbox-client.test.ts` shows the mocking pattern), and
  `include_history: true` threads through to normalized items.

Then `npm run build` (tsc → `dist/`) and commit the rebuilt `dist/`.

**Acceptance:** `npm test` green; `npm run build` clean; `dist/` reflects the new
mapper and action.

## Verification

- `npm test` — all green, including the new default-invariant and query-strip tests.
- `npm run build` — clean tsc, `dist/` regenerated.
- Manual smoke (optional, reuses U1 setup): `search_members` with
  `linkedin_public_ids` for a stale contact — default call shows no history keys;
  `include_history: true` shows `past_positions` and the date fields.

## Out of Scope

- Exposing history on `search_leads` / `normalizeLead` (leads path is separate; not
  requested).
- Any write-side (`update_member`) handling of history — read-only feature.
- Pagination or filtering *within* `past_positions`.

## Risks / Notes

- **Query leak:** the single highest-risk detail — `searchMembers` passes `params`
  straight to the API. The U3 destructure is load-bearing; a test asserts it.
- **`past_positions` shape drift:** U1 must precede U2. If the live shape diverges
  from the assumed `PastPosition`, reconcile in U2 (extend/rename fields) rather
  than dropping data — the feature's whole value is reconstructing job changes.
- **Token expectation:** even opt-in, a `limit=100` call with `include_history: true`
  can roughly double the response (~53k tk with 6-role histories). Consumers should
  prefer targeted `linkedin_public_ids` lookups when requesting history. Consider
  documenting this in the tool description if it surprises callers in practice.
