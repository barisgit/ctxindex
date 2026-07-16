# Generic Storage Specification

## Purpose
Define the provider-neutral persistence, identity, relationship, binding, and transactional sync contracts for local context state.

## Requirements

### Requirement: Fresh generic Resource storage
For V1, the system SHALL create a fresh local schema implementing the generic storage model in SPEC §3b: Resources, typed field index rows, chunks plus full-text search, Relations, Artifact metadata, and Source/Sync bookkeeping. Per-domain tables, Adapter-private tables, and prototype-schema migration or compatibility paths MUST NOT be created.

#### Scenario: Profile-defined Resource is materialized generically
- **WHEN** an Adapter emits a valid Resource for a loaded Profile
- **THEN** core stores its envelope and payload and transactionally replaces its Profile-derived fields, chunks, and Relations using only generic core storage

#### Scenario: Fresh database replaces prototype state
- **WHEN** V1 storage is initialized without a current schema
- **THEN** the system creates the V1 generic schema without attempting to migrate a prototype database

### Requirement: Stable Source-scoped Resource identity and origins
For V1, every Resource SHALL use the stable `ctx://<source-id>/<adapter-opaque-suffix>` Ref contract from SPEC §3 and §4 for both synced and ad-hoc access. Core MUST distinguish `synced` rows from purgeable `adhoc` rows; a later sync of the same Ref MUST upgrade the materialization to `synced`, and ad-hoc rows MUST NOT become tombstones.

#### Scenario: Synced and ad-hoc access converge on one Resource
- **WHEN** provider retrieval caches an ad-hoc Resource and a later sync emits the same Ref
- **THEN** one Resource identity remains and its origin becomes `synced`

#### Scenario: Synced deletion preserves a tombstone
- **WHEN** a successful sync emits a tombstone for a synced Resource
- **THEN** the Resource is excluded from normal search but remains queryable through an explicit deleted filter until an explicit purge

### Requirement: Generic bidirectional Relations
For V1, core SHALL store and traverse the bidirectional Relation model in SPEC §4, including targets by Ref or declared natural key and unresolved edges. Relation semantics MUST come from Profile declarations rather than domain-specific core logic.

#### Scenario: Natural-key Relation resolves after target arrival
- **WHEN** a Resource is stored with a natural-key Relation whose target is absent and a matching target arrives later
- **THEN** traversal resolves the Relation without rewriting domain-specific core code

#### Scenario: Unresolved Relation remains observable
- **WHEN** no Resource matches a stored natural-key Relation
- **THEN** the Relation remains queryable as unresolved

### Requirement: Explicit Realm, Source, Account, and Grant bindings
For V1, the system SHALL implement the Source and Realm behavior in SPEC §3, §5, and §10a: every Source belongs to exactly one explicitly selected existing user-created Realm, and authenticated Sources resolve credentials only through an explicit compatible Grant binding. Each authenticated Account MUST have a stable non-empty external identity unique within its provider; repeated authorization of the same `(provider, external identity)` MUST reuse that Account. A Grant belongs to exactly one Account/provider and records normalized scopes; multiple compatible Sources MAY reuse one Grant. Initialization MUST NOT seed or imply a `global` Realm.

#### Scenario: Source creation requires an existing Realm
- **WHEN** a caller creates a Source without an existing Realm
- **THEN** creation fails with an actionable error and no Source is stored

#### Scenario: Authenticated Source uses its linked Grant
- **WHEN** an authenticated Source performs sync or provider I/O
- **THEN** credentials are resolved through that Source's compatible `grant_id` rather than a global or most-recent Grant

#### Scenario: Reauthorization reuses Account identity
- **WHEN** the same stable external provider identity authorizes a second permission set
- **THEN** one Account owns both Grants and existing Source bindings remain explicit

#### Scenario: Compatible Grant is shared
- **WHEN** mailbox and calendar Adapters from one provider require scopes contained by one Grant
- **THEN** Sources using both Adapters may explicitly bind that Grant without duplicating the Account or secrets

### Requirement: Transactional sync bookkeeping
For V1, sync-capable Adapters SHALL emit normalized operations that core validates and applies transactionally as specified in SPEC §8. Core MUST record each sync run and MUST advance the durable cursor only after associated Resource, field, chunk, Relation, and tombstone writes commit.

#### Scenario: Successful sync commits data and cursor
- **WHEN** a sync Adapter completes after emitting valid operations
- **THEN** core commits the operations, records a completed sync run, and advances the Source cursor

#### Scenario: Failed sync does not advance the cursor
- **WHEN** applying emitted operations fails or the Adapter terminates with an error
- **THEN** core records the failed run and leaves the previous durable cursor unchanged
