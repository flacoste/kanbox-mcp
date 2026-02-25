---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, quality]
dependencies: []
---

# Replace `any` Types in normalize.ts with Loose Raw Types

## Problem Statement

All normalize functions use `any` for their raw parameter, losing type safety. TypeScript reviewer flagged this as Medium severity.

## Findings

- `src/lib/normalize.ts:98` — `normalizeMember(raw: any)`
- `src/lib/normalize.ts:158` — `normalizeLead(raw: any)`
- `src/lib/normalize.ts:195` — `normalizeMessage(raw: any)`
- `src/lib/normalize.ts:211` — `normalizeList(raw: any)`
- The `eslint-disable @typescript-eslint/no-explicit-any` comment at top confirms this is a known tradeoff

## Proposed Solutions

### Option A: Use `Record<string, unknown>` (Recommended)
Replace `any` with `Record<string, unknown>` and cast nested access.

**Pros:** Safer, still flexible for unknown API shapes
**Cons:** Need casts for nested property access
**Effort:** Medium
**Risk:** Low

### Option B: Define loose raw interfaces
Create `RawMember`, `RawLead`, etc. with optional fields.

**Pros:** Best type safety
**Cons:** Duplicates API shape, maintenance burden
**Effort:** Medium
**Risk:** Low

## Acceptance Criteria

- [ ] No `any` types in normalize.ts
- [ ] ESLint disable comment removed
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | TypeScript reviewer finding |

## Resources

- File: `src/lib/normalize.ts`
