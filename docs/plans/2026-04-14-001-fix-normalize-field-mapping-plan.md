---
title: "fix: Correct two field-name mismatches in normalizeMember"
type: fix
status: active
date: 2026-04-14
---

# fix: Correct two field-name mismatches in normalizeMember

## Overview

Two fields in `normalizeMember()` read property names that don't exist on the raw API response, causing them to always return `null`. The correct field names are confirmed by live API output.

## Problem Frame

When normalizing a member's `lead` object:
1. `company_headcount` reads `lead.company_headcount` — but the API returns `lead.company_employee_count`
2. `company_linkedin_url` reads `lead.company_linkedin_url` — but the API returns `lead.company_linkedin`

Both fields silently fall through to `null` via the `??` operator.

## Requirements Trace

- R1. `company_headcount` must surface the employee count from `lead.company_employee_count`
- R2. `company_linkedin_url` must surface the company LinkedIn URL from `lead.company_linkedin`

## Scope Boundaries

- Only fix the two confirmed field-name mismatches
- Do not add new fields, change the `NormalizedMember` interface shape, or refactor other normalizers

## Key Technical Decisions

- **Keep existing property names on `NormalizedMember`**: The normalized interface uses good names (`company_headcount`, `company_linkedin_url`). Only the *source* field name in the mapping body needs to change.

## Implementation Units

- [ ] **Unit 1: Fix field-name mappings in normalizeMember**

**Goal:** Map the two fields to the correct raw API property names.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `src/lib/normalize.ts`
- Test: `test/lib/normalize.test.ts`

**Approach:**
- Line ~108: change `lead.company_headcount` → `lead.company_employee_count`
- Line ~109: change `lead.company_linkedin_url` → `lead.company_linkedin`

**Patterns to follow:**
- Other fields in the same function already map differing raw names to normalized names (e.g., `conversations_ids` → `conversations`)

**Test scenarios:**
- Happy path: normalizeMember with a lead containing `company_employee_count: 89776` returns `company_headcount: 89776`
- Happy path: normalizeMember with a lead containing `company_linkedin: "https://www.linkedin.com/company/salesforce"` returns `company_linkedin_url: "https://www.linkedin.com/company/salesforce"`
- Edge case: normalizeMember with a lead missing both fields still returns `null` for each

**Verification:**
- Existing tests still pass
- New test cases confirm the two fields are populated from real API shape

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Downstream consumers may rely on these being null | Unlikely — the fields were always intended to have values. Surfacing data is strictly additive. |

## Sources & References

- Raw API response captured in this session confirms field names
- Related code: `src/lib/normalize.ts` lines 96–154
