---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, security, performance]
dependencies: []
---

# Add Input Bounds to Zod Schemas

## Problem Statement

Search schemas have no min/max on `limit`/`offset`, and message fields have no length cap. An agent could request `limit: 999999` or send extremely long messages.

## Findings

- `src/actions/search-members.ts` — `limit` and `offset` are unbounded `z.number()`
- `src/actions/search-leads.ts` — same issue
- `src/actions/send-message.ts` — `message` has no max length
- `src/actions/send-connection.ts` — `message` should cap at 300 chars (LinkedIn limit)
- Performance and Security agents both flagged this

## Proposed Solutions

### Option A: Add Zod constraints (Recommended)
Add `.min()`, `.max()`, `.default()` to schemas.

```typescript
limit: z.number().min(1).max(100).default(20).optional(),
offset: z.number().min(0).default(0).optional(),
message: z.string().max(300),
```

**Pros:** Validates at parse time, clear error messages
**Cons:** Might reject edge cases if limits too tight
**Effort:** Small
**Risk:** Low

## Acceptance Criteria

- [ ] `limit` capped at 100 with default 20
- [ ] `offset` minimum 0, default 0
- [ ] `send_connection` message capped at 300 chars
- [ ] `send_message` message has reasonable max (e.g., 8000)
- [ ] Tests verify boundary values

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Security + Performance finding |

## Resources

- Files: `src/actions/search-members.ts`, `src/actions/search-leads.ts`, `src/actions/send-message.ts`, `src/actions/send-connection.ts`
