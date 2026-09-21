# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Contacts

### Member
A LinkedIn contact the account owner is already connected to or in conversation with (inbox or connections). A Member always carries an internal LinkedIn ID, so it is the record type from which messages and connection requests can be sent.

### Lead
A scraped or list-sourced contact that may not be a connection. A Lead carries the public profile slug but not the internal LinkedIn ID, so acting on it (messaging, connecting) requires resolving it to a Member first.

### Internal LinkedIn ID
The opaque identifier LinkedIn assigns a person (the `ACoAAA…` form). Required for messaging and connection requests; distinct from the public profile slug and not derivable from it.

### Public profile slug
The human-readable handle in a profile URL (`linkedin.com/in/<slug>`). Used for exact lookup and enrichment, but not accepted where an operation needs the Internal LinkedIn ID.

## Server structure

### Action
A single Kanbox API operation exposed by the server as one self-contained unit, selected by name through a dispatcher tool. An Action validates its own inputs, calls the upstream API, and normalizes the response.

### Dispatcher tool
One of the two tools the server exposes to MCP clients, each routing a named Action to its handler — one for read operations, one for writes — so the read/write permission split lands at the tool boundary.

### Normalization
Reshaping a verbose, deeply nested Kanbox API response into a compact, flat structure by lifting nested contact fields to the top level, reducing the tokens an LLM spends parsing it. The default result stays minimal; optional or verbose data is emitted only when explicitly requested.

## Pipeline

### Pipeline
A named staging lane a Member or Lead is assigned to so a batch of contacts can be worked together — for example, held for a bulk profile-refresh action the account owner runs in the Kanbox UI. A contact carries at most one Pipeline assignment at a time.

Assigning is done by Pipeline name; clearing it ("un-staging") requires sending an explicit empty value, not omitting the field — an omitted field leaves the current assignment unchanged.

### Step
A stage within a Pipeline that positions a contact along it. Set and cleared together with the Pipeline assignment.

## Flagged ambiguities

- The Internal LinkedIn ID and the Public profile slug are both "the LinkedIn identifier" in casual use but are distinct: only the former works for messaging and connection requests, and a Lead has only the latter until resolved to a Member.
