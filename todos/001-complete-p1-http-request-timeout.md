---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, security, performance]
dependencies: []
---

# Add HTTP Request Timeout to KanboxClient

## Problem Statement

`KanboxClient.request()` has no timeout — a hung Kanbox API response will block the MCP server indefinitely. This was flagged by Performance (P0), Architecture, and Security agents.

## Findings

- `src/lib/kanbox-client.ts:87` — `fetch(url, init)` has no `AbortSignal`
- A single stuck request can halt the entire MCP server since it runs on stdio
- No maximum response body size either — unbounded `res.text()` could exhaust memory

## Proposed Solutions

### Option A: AbortSignal.timeout (Recommended)
Add `signal: AbortSignal.timeout(30_000)` to the fetch call.

**Pros:** One-line fix, native API, no dependencies
**Cons:** None significant
**Effort:** Small
**Risk:** Low

### Option B: AbortController with manual timer
Create AbortController, setTimeout to abort after 30s.

**Pros:** More control, can log timeout events
**Cons:** More code for same result
**Effort:** Small
**Risk:** Low

## Acceptance Criteria

- [ ] All fetch calls have a 30-second timeout
- [ ] Timeout errors are caught and returned as formatted errors
- [ ] Tests verify timeout behavior

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Flagged by 3/7 agents |

## Resources

- File: `src/lib/kanbox-client.ts:83-110`
- MDN: AbortSignal.timeout()
