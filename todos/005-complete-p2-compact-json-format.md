---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, performance]
dependencies: []
---

# Remove Pretty-Printing from formatResult

## Problem Statement

`formatResult` uses `JSON.stringify(data, null, 2)` which adds whitespace, roughly doubling response token count for large results. In an MCP context, every token costs latency and money.

## Findings

- `src/lib/errors.ts` — `formatResult` pretty-prints JSON
- Performance oracle flagged as P2
- For a 50-member search result, this could add significant overhead

## Proposed Solutions

### Option A: Use compact JSON (Recommended)
Change to `JSON.stringify(data)` — no indentation.

**Pros:** Halves response size, trivial change
**Cons:** Harder to debug raw responses (but MCP tools handle rendering)
**Effort:** Small
**Risk:** None

## Acceptance Criteria

- [ ] `formatResult` uses compact JSON
- [ ] Tests updated if they assert on formatting

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Performance oracle finding |

## Resources

- File: `src/lib/errors.ts`
