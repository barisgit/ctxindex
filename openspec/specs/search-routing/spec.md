# Search Routing Specification

## Purpose
Define unified local and provider search planning, exact filtering, routing overrides, ranking, and graceful degradation.

## Requirements

### Requirement: Unified local and provider search contract
For V1, search SHALL use one normalized query, typed filter grammar, result envelope, and deterministic JSON shape across local full-text and provider-side origins as required by SPEC §10 and §10e. Local full-text search over Resource and chunk content MUST remain the baseline, and field validity and value parsing MUST derive from Profile declarations.

#### Scenario: Local search uses Profile-derived projections
- **WHEN** a query matches a stored Resource envelope, chunk, or typed field
- **THEN** search returns the Resource with its best matching chunks through the unified result envelope

#### Scenario: Invalid field filter fails before execution
- **WHEN** a caller supplies a field or value not declared as valid for the selected kind
- **THEN** search rejects the query with a deterministic usage error before local or provider execution

### Requirement: Per-Source routing and overrides
For V1, search planning SHALL follow the precedence in SPEC §3c and §10e: a `--local-only` or `--remote` request overrides per-Source configuration, which overrides the Adapter routing decision. Indexed Sources and hybrid hot windows MUST use local search; federated Sources and hybrid queries outside local coverage MUST use declared `search-remote` implementations.

#### Scenario: Local-only override suppresses provider search
- **WHEN** a query requests `--local-only` across Sources that support remote search
- **THEN** the planner searches only locally available projections

#### Scenario: Provider search supplies uncovered Gmail results
- **WHEN** a Gmail mailbox query is not satisfiable from its configured local window and remote search is allowed
- **THEN** the planner invokes Gmail provider search and returns normalized results with stable `ctx://` Refs

### Requirement: Exact Realm and Source filtering
For V1, an omitted Realm filter SHALL search all available Realms, while every explicit Realm or Source filter MUST be exact as required by SPEC §10a. The planner MUST NOT implicitly include a `global` or any additional Realm.

#### Scenario: Omitted Realm spans all Realms
- **WHEN** a caller searches without a Realm filter
- **THEN** the planner includes eligible Sources from every user-created Realm

#### Scenario: Explicit Realm is exact
- **WHEN** a caller searches with `--realm company`
- **THEN** only Sources belonging to the `company` Realm are planned

### Requirement: Mixed-origin ranking and graceful degradation
For V1, merged search results SHALL be ranked within each origin and interleaved without numerically comparing local and provider scores, in accordance with SPEC §10e. A provider failure or timeout MUST preserve successful local results and SHALL produce a per-origin warning; explain output MUST identify each result's origin.

#### Scenario: Provider failure preserves local results
- **WHEN** local search succeeds and one remote origin fails because it is offline, unauthorized, timed out, or unavailable
- **THEN** search returns the local results with a warning identifying the failed origin

#### Scenario: Mixed-origin explain identifies routing
- **WHEN** explain mode returns both local and provider results
- **THEN** each result reports whether it came from the local index or provider search

### Requirement: Proving Adapters share search behavior
For V1, `google.mailbox` SHALL prove provider message discovery and `local.directory` SHALL prove indexed file sync and search through the same Profile, Resource, Ref, filter, and result contracts.

#### Scenario: Gmail and local files share the result envelope
- **WHEN** equivalent searches target a configured Gmail mailbox and a configured local directory
- **THEN** both return Profile-backed Resources through the same generic search envelope without provider-specific CLI commands
