---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# Validate LinkedIn Domain in add_lead_url Action

## Problem Statement

The `add_lead_url` action accepts any URL and passes it to the Kanbox API. An agent could be tricked into submitting internal/malicious URLs, creating an SSRF vector.

## Findings

- `src/actions/add-lead-url.ts` — accepts `url` param without domain validation
- Only LinkedIn profile URLs are valid for this endpoint
- Security sentinel flagged as Medium severity

## Proposed Solutions

### Option A: URL hostname validation (Recommended)
Parse URL and check hostname matches `linkedin.com` or `www.linkedin.com`.

```typescript
const parsed = new URL(url);
if (!parsed.hostname.endsWith("linkedin.com")) {
  throw new Error("URL must be a LinkedIn profile URL");
}
```

**Pros:** Simple, effective, prevents SSRF
**Cons:** Could break if LinkedIn uses subdomains
**Effort:** Small
**Risk:** Low

### Option B: Regex pattern match
Match against LinkedIn profile URL pattern.

**Pros:** More precise validation
**Cons:** Brittle regex, harder to maintain
**Effort:** Small
**Risk:** Medium

## Acceptance Criteria

- [ ] Only `*.linkedin.com` URLs accepted
- [ ] Non-LinkedIn URLs return a clear error message
- [ ] Test covers valid and invalid URLs

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-24 | Created from code review | Security sentinel finding |

## Resources

- File: `src/actions/add-lead-url.ts`
