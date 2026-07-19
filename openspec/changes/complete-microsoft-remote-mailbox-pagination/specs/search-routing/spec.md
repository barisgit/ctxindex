## MODIFIED Requirements

### Requirement: Filter-only local enumeration
When the query positional is absent and at least one filter is present, search without `--remote` SHALL enumerate matching Resources from local projections only, ordered by `occurredAt` descending with NULL timestamps last, tie-broken by `ref` ascending. A query-less search MUST NOT invoke any `search-remote` Adapter operation unless `--remote` is explicit. A query-less `--remote` search SHALL be valid when at least one narrowing Realm, Adapter, Source, kind, field, or time filter is present; a bare search with no text and no filters SHALL remain invalid usage (exit 2).

#### Scenario: Filter-only enumeration returns newest first
- **WHEN** a caller runs `search --kind communication.message --realm work` with no query text and without `--remote`
- **THEN** matching local Resources are returned ordered by `occurredAt` descending, tie-broken by `ref` ascending, without contacting any provider

#### Scenario: Query-less constrained remote request enumerates
- **WHEN** a caller runs `search --remote --source work-outlook --kind communication.message` with no query text
- **THEN** the exact Source's declared remote-search operation receives an empty normalized text query plus the narrowing filters

#### Scenario: Federated Sources are skipped without remote override
- **WHEN** a filter-only search without `--remote` plans Sources whose Adapter routing is `federated` or `hybrid`
- **THEN** only local projections are searched and no `search-remote` call is made

### Requirement: Deterministic local pagination
Search SHALL accept `--offset <n>` (a non-negative integer, default 0) for local executions: filter-only searches without `--remote` and queryful searches with `--local-only`. Results SHALL be the deterministic ordering's window `[offset, offset + limit)`, and the result envelope SHALL report `pagination` with `offset`, `limit`, and `hasMore`, where `hasMore` is true exactly when at least one further Resource follows the window. `--offset` combined with `--remote` or `--continuation`, or with a queryful search lacking `--local-only`, MUST fail as invalid usage (exit 2).

#### Scenario: Second page resumes deterministically
- **WHEN** an unchanged index holds 30 matching Resources and a filter-only search runs with `--limit 20` then `--limit 20 --offset 20`
- **THEN** the two invocations return the first 20 and remaining 10 Resources with no overlap or gap, with `hasMore` true then false

#### Scenario: Offset with remote execution is rejected
- **WHEN** a caller combines `--offset` with `--remote` or `--continuation`, or uses query text without `--local-only`
- **THEN** the CLI exits 2 with an actionable error explaining that offset pagination is local-only

## ADDED Requirements

### Requirement: Exact-Source remote continuation
Remote search SHALL accept an opaque `--continuation <token>` only with `--remote` and exactly one `--source`, and SHALL pass that token only to the selected Source's generic remote-search operation. Continuation MUST be rejected as invalid usage before provider I/O when it is empty or malformed for the selected Adapter, combined with `--offset` or `--local-only`, used without `--remote`, used without exactly one Source, or reused with a changed normalized query or limit. A single-Source remote result SHALL report deterministic JSON `pagination` containing `limit`, `hasMore`, and `continuation`, where `hasMore` is true exactly when continuation is non-null.

#### Scenario: Agent resumes one remote Source
- **WHEN** an exact-Source remote result reports a non-null continuation and the caller repeats the same query, filters, and limit with that token
- **THEN** the selected Adapter resumes after the prior provider page and JSON reports the next continuation state without returning prior-page Refs

#### Scenario: Unsupported continuation combination is rejected
- **WHEN** a caller combines continuation with local execution, offset, multiple Sources, no Source, or a changed query contract
- **THEN** search exits 2 with an actionable invalid-usage error before provider I/O

#### Scenario: Multi-Source remote search does not claim one global cursor
- **WHEN** a remote search plans more than one independently ranked Source
- **THEN** it returns the bounded interleaved results without remote pagination metadata and continuation requires narrowing a later request to one exact Source
