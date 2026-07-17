## Why

Agents and users cannot enumerate indexed Resources. `search` hard-requires query text, so "show my calendar for next week" or "latest 20 work emails" is impossible without inventing a query string. `search` also has only `--limit` with no offset/cursor: truncation is reported but not resumable, so results beyond the first page are unreachable. The bundled skills never document `--limit`, truncation, or any pagination idiom, so agent consumers would not use pagination even if it existed.

## What Changes

- Make the `search` query positional optional when at least one filter (`--realm`, `--adapter`, `--source`, `--kind`, `--field`, `--since`, `--until`) is present: filter-only local enumeration with deterministic ordering (primary timestamp descending, tie-broken stably). A bare `search` with no query and no filters remains an error.
- Add local pagination to `search` (e.g. `--offset` or an opaque continuation token — design decision) so truncated result sets are resumable. Deterministic ordering is a prerequisite.
- Remote scope: filter-only remote enumeration and remote pagination are DEFERRED; filter-only queries route to local projections only (`--remote` with no query is an error), documented in the spec.
- Update bundled skills (`getting-started`, `reference/cli-overview`) to teach filter-only enumeration and the pagination idiom — the agent-facing API surface per SPEC §10c.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `search-routing`: optional query with filters, deterministic ordering, local pagination, remote deferral rule.
- Skills surface (SPEC §10c; no dedicated capability spec — requirement lands in `search-routing` delta or SPEC.md §10c): enumeration + pagination guidance in bundled skills.

## Impact

- `apps/cli` search args/validation; `packages/core` search service ordering + pagination; skills content; unit/integration/e2e search tests.
- No storage schema, auth, or adapter changes. Remote `search-remote` adapter operations untouched.
