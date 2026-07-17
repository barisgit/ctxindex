## MODIFIED Requirements

### Requirement: Unified local and provider search contract
For V1, search SHALL use one normalized query, typed filter grammar, result envelope, and deterministic JSON shape across local full-text and provider-side origins as required by SPEC §10 and §10e. Local full-text search over Resource and chunk content MUST remain the baseline, and field validity and value parsing MUST derive from Profile declarations. The query positional SHALL be optional when at least one filter (`--realm`, `--adapter`, `--source`, `--kind`, `--field`, `--since`, `--until`) is present; a bare `search` with neither query text nor filters MUST fail as invalid usage (exit 2).

#### Scenario: Local search uses Profile-derived projections
- **WHEN** a query matches a stored Resource envelope, chunk, or typed field
- **THEN** search returns the Resource with its best matching chunks through the unified result envelope

#### Scenario: Invalid field filter fails before execution
- **WHEN** a caller supplies a field or value not declared as valid for the selected kind
- **THEN** search rejects the query with a deterministic usage error before local or provider execution

#### Scenario: Bare search without query or filters is rejected
- **WHEN** a caller invokes `search` with no query text and no filters
- **THEN** the CLI exits 2 with an actionable usage error naming the accepted filters

## ADDED Requirements

### Requirement: Filter-only local enumeration
When the query positional is absent and at least one filter is present, search SHALL enumerate matching Resources from local projections only, ordered by `occurredAt` descending with NULL timestamps last, tie-broken by `ref` ascending. A query-less search MUST NOT invoke any `search-remote` Adapter operation, and `--remote` without query text MUST fail as invalid usage (exit 2). Filter-only remote enumeration and remote pagination are DEFERRED beyond this change.

#### Scenario: Filter-only enumeration returns newest first
- **WHEN** a caller runs `search --kind email.message --realm work` with no query text
- **THEN** matching local Resources are returned ordered by `occurredAt` descending, tie-broken by `ref` ascending, without contacting any provider

#### Scenario: Query-less remote request is rejected
- **WHEN** a caller runs `search --remote --kind email.message` with no query text
- **THEN** the CLI exits 2 with an actionable error stating that `--remote` requires query text because remote enumeration is deferred

#### Scenario: Federated Sources are skipped without remote calls
- **WHEN** a filter-only search plans Sources whose Adapter routing is `federated` or `hybrid`
- **THEN** only local projections are searched and no `search-remote` call is made

### Requirement: Deterministic local pagination
Search SHALL accept `--offset <n>` (a non-negative integer, default 0) for local executions: filter-only searches and queryful searches with `--local-only`. Results SHALL be the deterministic ordering's window `[offset, offset + limit)`, and the result envelope SHALL report `pagination` with `offset`, `limit`, and `hasMore`, where `hasMore` is true exactly when at least one further Resource follows the window. `--offset` combined with `--remote`, or with a queryful search lacking `--local-only`, MUST fail as invalid usage (exit 2).

#### Scenario: Second page resumes deterministically
- **WHEN** an unchanged index holds 30 matching Resources and a filter-only search runs with `--limit 20` then `--limit 20 --offset 20`
- **THEN** the two invocations return the first 20 and remaining 10 Resources with no overlap or gap, with `hasMore` true then false

#### Scenario: Offset with remote execution is rejected
- **WHEN** a caller combines `--offset` with `--remote`, or with a queryful search that is not `--local-only`
- **THEN** the CLI exits 2 with an actionable error explaining that pagination is local-only

### Requirement: Skills teach enumeration and pagination
The bundled skills (SPEC §10c) SHALL document filter-only enumeration and the local pagination idiom: `getting-started` and `reference/cli-overview` MUST show how to enumerate without query text using filters and how to page with `--limit`/`--offset` driven by `hasMore`.

#### Scenario: Bundled skills document the pagination idiom
- **WHEN** an agent reads the bundled `getting-started` or `reference/cli-overview` skill
- **THEN** it finds guidance for filter-only enumeration and for advancing `--offset` by `--limit` while `hasMore` is true
