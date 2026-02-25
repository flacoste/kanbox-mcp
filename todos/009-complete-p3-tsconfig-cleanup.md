---
status: complete
priority: p3
issue_id: "009"
tags: [code-review, quality, security]
dependencies: []
---

# Remove Unnecessary tsconfig Options

## Problem Statement

`tsconfig.json` has `declaration: true` and `sourceMap: true` which are unnecessary for an MCP server binary. Source maps expose source structure; declarations are unused since this isn't a library.

## Findings

- Security sentinel flagged source maps as information disclosure risk (Low)
- Simplicity reviewer flagged both as unnecessary config

## Proposed Solutions

### Option A: Remove both options (Recommended)
Delete `declaration` and `sourceMap` from tsconfig.json.

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] `declaration` and `sourceMap` removed from tsconfig.json
- [ ] Build still works
- [ ] No `.d.ts` or `.js.map` files generated

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Security + Simplicity finding |

## Resources

- File: `tsconfig.json`
