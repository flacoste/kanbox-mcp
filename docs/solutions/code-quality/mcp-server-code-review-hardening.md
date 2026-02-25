---
title: Kanbox MCP Server Code Review Hardening — 9 Findings Resolved
date: 2026-02-24
category: code-quality
problem_type: code_review_resolution
severity: medium
components:
  - kanbox-client (HTTP timeout)
  - add-lead-url (SSRF validation)
  - errors (dead code, compact JSON)
  - action schemas (input bounds, .describe())
  - normalize (type safety)
  - tests (dead mock)
  - tsconfig (build config)
tags:
  - mcp-server
  - security-hardening
  - performance
  - type-safety
  - agent-native-design
  - code-review
  - parallel-resolution
related_issues: []
resolution_time: ~30 minutes (7 parallel agents)
---

# MCP Server Code Review Hardening — 9 Findings Resolved

## Problem Statement

After building the Kanbox MCP server to feature-complete state (9 actions across 2 dispatcher tools, full test suite, response normalization), a comprehensive 7-agent code review identified 10 findings spanning security, performance, type safety, and agent UX. After triage (1 finding invalidated), 9 were resolved in a single parallel execution pass.

## Root Cause Analysis

These findings accumulated during rapid MVP development that prioritized feature velocity over production hardening:

1. **Missing operational safeguards**: No timeout on fetch — local testing never exposed hanging API scenarios.
2. **Security gaps from openness**: SSRF in `add_lead_url` — no threat model applied during schema design.
3. **Type relaxation for speed**: `any` in normalize functions was a conscious prototype trade-off.
4. **Dead code from iteration**: `formatAccepted()` and duplicate test mocks were refactoring artifacts.
5. **Deferred optimization**: Pretty-printed JSON used for debugging; token cost not considered until review.
6. **Agent UX gaps**: Missing `.describe()` on Zod schemas — designed without considering agent error recovery.
7. **Template cruft**: `declaration`/`sourceMap` in tsconfig copied from library template.

## Solutions Applied

### 1. HTTP Request Timeout (P1)

**File:** `src/lib/kanbox-client.ts`

Added 30-second abort signal to all fetch calls:

```typescript
const res = await fetch(url, {
  ...init,
  headers: { ... },
  signal: AbortSignal.timeout(30_000),
});
```

Server now fails fast on unresponsive API rather than hanging indefinitely.

### 2. SSRF Prevention (P1)

**File:** `src/actions/add-lead-url.ts`

Added Zod refinement validating LinkedIn domain:

```typescript
linkedin_profile_url: z.string().url().refine(
  (url) => {
    try { return new URL(url).hostname.endsWith("linkedin.com"); }
    catch { return false; }
  },
  { message: "URL must be a LinkedIn profile URL (*.linkedin.com)" },
),
```

### 3. Dead Code Removal (P1)

**File:** `src/lib/errors.ts`

Deleted `formatAccepted()` — exported but never imported anywhere. Flagged unanimously by all 7 review agents.

### 4. Input Bounds (P2)

**Files:** All 9 action schemas

Added constraints: `.min(1).max(100)` on limit, `.min(0)` on offset, `.max(8000)` on send_message message. `send_connection` already had `.max(300)`.

### 5. Compact JSON (P2)

**File:** `src/lib/errors.ts`

Changed `JSON.stringify(data, null, 2)` to `JSON.stringify(data)` — roughly halves response token count.

### 6. Type Safety (P2)

**File:** `src/lib/normalize.ts` + 4 action files

Replaced all `any` with `Record<string, unknown>`, cast nested objects explicitly, removed `eslint-disable` comment.

### 7. Dead Mock (P3)

**File:** `test/tools/kanbox-read.test.ts`

Removed first mock that was immediately overridden by second mock in same test.

### 8. tsconfig Cleanup (P3)

Removed `declaration: true` and `sourceMap: true` — unnecessary for an MCP server binary.

### 9. Zod .describe() (P3)

**Files:** All 9 action schemas

Added `.describe()` to every field with actionable descriptions, improving agent error recovery.

## Parallelization Strategy

Analyzed file dependencies and found 7 independent work streams:

| Agent | Files | Todos |
|-------|-------|-------|
| 1 | kanbox-client.ts | 001 (timeout) |
| 2 | add-lead-url.ts | 002 (SSRF) |
| 3 | errors.ts | 003 + 005 (dead code + compact JSON) |
| 4 | all action schemas | 004 + 010 (bounds + .describe()) |
| 5 | normalize.ts + action files | 006 (type safety) |
| 6 | kanbox-read.test.ts | 008 (dead mock) |
| 7 | tsconfig.json | 009 (config cleanup) |

Combined todos 003+005 (same file: errors.ts) and 004+010 (same files: action schemas) to avoid merge conflicts. All 7 agents ran in parallel. Result: 46/46 tests pass, clean build, single commit `cd34c2e`.

## Prevention Strategies

### MCP Server Security Checklist

- All `fetch()` calls must have `AbortSignal.timeout()` — enforce via wrapper function
- All user-provided URLs validated against domain whitelist before passing to API
- All numeric inputs constrained with `.min()` and `.max()` in Zod schemas
- All string inputs have reasonable `.max()` length caps

### MCP Token Efficiency

- Never pretty-print JSON in MCP responses — use `JSON.stringify(data)` without indentation
- Only include fields agents need in responses (normalization layer handles this)
- Test response sizes; if >5KB, consider pagination

### Agent-Native Design

- Every Zod field must have `.describe()` with purpose, accepted range, and examples
- Error messages include context: what failed, why, what to try next
- Tool descriptions explicitly state which ID format to use (internal vs. public)

### TypeScript Strictness

- No `any` in source code — use `Record<string, unknown>` for unknown API shapes
- `strict: true` in tsconfig, remove unnecessary options for non-library projects
- Delete dead code immediately — don't leave exported functions without importers

## Related Documentation

- **Previous solution:** [docs/solutions/integration-issues/kanbox-mcp-api-field-mapping.md](../integration-issues/kanbox-mcp-api-field-mapping.md) — API response shape mismatches from initial development
- **Implementation plan:** [docs/plans/2026-02-24-feat-kanbox-mcp-server-plan.md](../../plans/2026-02-24-feat-kanbox-mcp-server-plan.md) — original architecture and API mappings
- **Project conventions:** [CLAUDE.md](../../../CLAUDE.md) — ESM, error handling, normalization patterns
