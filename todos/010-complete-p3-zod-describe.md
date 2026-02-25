---
status: complete
priority: p3
issue_id: "010"
tags: [code-review, architecture]
dependencies: []
---

# Add .describe() to Zod Schema Fields

## Problem Statement

Zod schemas in action files lack `.describe()` annotations. When validation fails, agents get generic "expected number, received string" errors instead of actionable guidance like "limit must be 1-100".

## Findings

- Agent-native reviewer flagged this
- All schemas in `src/actions/*.ts` use bare Zod types
- Adding `.describe()` improves agent self-correction on validation errors

## Proposed Solutions

### Option A: Add .describe() to all schema fields (Recommended)
```typescript
limit: z.number().describe("Max results to return (1-100)").optional(),
```

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] All Zod fields in action schemas have `.describe()`
- [ ] Descriptions match tool DESCRIPTION text

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Agent-native reviewer finding |

## Resources

- Files: `src/actions/*.ts`
