# Kanbox MCP Integration Brainstorm

**Date:** 2026-02-24
**Status:** Draft

## What We're Building

An MCP server that wraps the Kanbox API (a LinkedIn CRM) to integrate LinkedIn contact data with the Obsidian vault. The server exposes two coarse-grained tools — one for reads, one for writes — using action dispatchers to minimize context window overhead while enabling Claude Code's permission system for write approval.

### Use Cases

1. **Sync profile pictures** — Download LinkedIn headshots from Kanbox and store them in the vault, referenced in both frontmatter and inline
2. **Sync messages / Last Communication** — Retrieve LinkedIn message history, synthesize it, and update the `Last Communication` date on contact summary files
3. **Sync labels/tags** — Keep Kanbox labels and vault tags in sync (initially Kanbox → Vault, eventually bidirectional)
4. **Add leads for scraping** — From the scan-intros workflow, add prospects to Kanbox by LinkedIn URL so Kanbox scrapes their profile
5. **Send messages / connection requests** — Compose and send LinkedIn messages or connection requests through Kanbox

### Trigger Model

- **Per-contact:** While working on a contact file, sync that specific person
- **Batch:** Periodically sync all contacts updated since last sync (using Kanbox's `updated_since` filter)

## Why This Approach

### MCP Server (over alternatives)

- **Consistent with existing architecture** — Slack integrations already use MCPs; Granola MCP is planned. Kanbox fits the same pattern.
- **Reusable across workflows** — Any skill or conversation can call Kanbox tools without reimplementing API calls
- **Full read-write access** — Claude can compose Kanbox API calls flexibly, not just run predefined scripts

### Dispatcher Tools (over many fine-grained tools)

Inspired by [Jesse Vincent's article on MCP API design](https://blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis/):

- A naive 1:1 mapping of Kanbox endpoints → ~10 tools → ~3,000-5,000 tokens of context overhead per session
- Two dispatcher tools with `action` parameters → ~1,500 tokens total
- The Playwright MCP's 13,678-token overhead is a cautionary example

**Why two tools instead of one:** Claude Code's permission system operates at the tool level. Splitting read/write lets users auto-approve `kanbox_read` while requiring explicit approval for `kanbox_write`. An env var allowlist was considered but doesn't trigger Claude Code's approval flow.

See **Key Decisions** for tool signatures and action list.

### TypeScript + Separate Repo

- TypeScript is the dominant language for MCP servers, with the most mature SDK
- Separate repo (`~/Projects/kanbox-mcp/` or similar) keeps it independent from the vault — cleaner separation, could be published

## Key Decisions (MCP Server)

### Two-Tool Dispatcher Design
- `kanbox_read(action, params)` — read-only, no side effects, auto-approvable
- `kanbox_write(action, params)` — mutations, requires explicit approval
- The MCP returns raw Kanbox API data — vault interpretation (mapping labels to tags, storing pictures, etc.) happens in calling workflows, not in the MCP
- Token budget target: under 1,500 tokens total for both tool descriptions (to be validated during implementation)

### Action Surface

**`kanbox_read` actions:**
- `search_members` — Search/filter members (by name, labels, linkedin_public_ids, updated_since, type)
- `get_member` — Get a single member by ID
- `get_messages` — Get messages for a conversation

**`kanbox_write` actions:**
- `update_member` — Update labels, email, phone, custom field
- `send_message` — Send a message to a connection
- `send_connection` — Send a connection request
- `add_lead` — Add a lead by LinkedIn URL (triggers scraping)

**Nice-to-have (add when needed):**
- `list_lists` (read) — List Kanbox lists
- `search_leads` (read) — Search leads by name

### Auth and Access
- API key via `KANBOX_API_TOKEN` environment variable
- Full read-write API access at the server level
- Access control via Claude Code's tool permission system: auto-approve `kanbox_read`, prompt for `kanbox_write`

## Open Questions (MCP Server)

1. **Repo name and location** — Exact path for the MCP server repo (e.g. `~/Projects/kanbox-mcp/`)
2. **Kanbox API rate limits** — Not documented in the API spec. Need to test empirically or contact Kanbox support before building batch operations

## Future Considerations (per-workflow)

These decisions can wait until implementing individual sync workflows on top of the MCP server:

### Vault Integration Decisions (decided in brainstorm, apply when building workflows)
- **Contact matching** — Extract LinkedIn public ID from vault's `LinkedIn:` URL, match against Kanbox `linkedin_public_id`
- **Profile pictures** — Store in `_resources/avatars/`, reference via frontmatter `image:` field + inline `![[]]` embed. Source: `lead.picture`
- **Avatar naming convention** — TBD. `firstname-lastname.jpg` (lowercased, hyphenated)? Handle name collisions
- **Label sync** — Initially Kanbox → Vault (Kanbox is more current); 1:1 case-normalized to PascalCase. Eventually vault becomes source of truth
- **Last Communication** — Pull `last_message_at`, update `Last Communication` frontmatter field. Sync since last tracked timestamp
- **Message sync depth** — Since last sync (track sync timestamp, fetch everything new)

### Open Workflow Questions
- **Label subset/scope** — Which Kanbox labels should sync to vault tags? Operational labels (pipeline stages) vs. categorical may need different treatment
- **Message synthesis format** — How synthesized messages should appear in contact summaries
- **Bidirectional label sync** — When/how to push vault tags back to Kanbox
- **Batch sync scheduling** — Frequency, conflict resolution, incremental vs. full sync
