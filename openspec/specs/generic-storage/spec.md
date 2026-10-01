# Generic Storage Specification

## Purpose
Define the provider-neutral persistence, identity, relationship, binding, and transactional sync contracts for local context state.
## Requirements
### Requirement: Fresh generic Resource storage
For V1, the system SHALL create a fresh local schema implementing this provider-neutral storage contract: Resources, typed field index rows, chunks plus full-text search, Relations, cached Artifact-byte metadata, and Source/Sync bookkeeping. Per-domain tables, Adapter-private tables, and prototype-schema migration or compatibility paths MUST NOT be created.

#### Scenario: Profile-defined Resource is materialized generically
- **WHEN** an Adapter emits a valid Resource for a loaded Profile
- **THEN** core stores its envelope and payload and transactionally replaces its Profile-derived fields, chunks, and Relations using only generic core storage

#### Scenario: Fresh database replaces prototype state
- **WHEN** V1 storage is initialized without a current schema
- **THEN** the system creates the V1 generic schema without attempting to migrate a prototype database

### Requirement: Stable Source-scoped Resource identity and origins
For V1, every Resource SHALL use the stable `ctx://<source-id>/<adapter-opaque-suffix>` Ref contract from [the core model](../core-model/spec.md) for both synced and ad-hoc access. Core MUST distinguish `synced` rows from purgeable `adhoc` rows; a later sync of the same Ref MUST upgrade the materialization to `synced`, and ad-hoc rows MUST NOT become tombstones.

#### Scenario: Synced and ad-hoc access converge on one Resource
- **WHEN** provider retrieval caches an ad-hoc Resource and a later sync emits the same Ref
- **THEN** one Resource identity remains and its origin becomes `synced`

#### Scenario: Synced deletion preserves a tombstone
- **WHEN** a successful sync emits a tombstone for a synced Resource
- **THEN** the Resource is excluded from normal search but remains queryable through an explicit deleted filter until an explicit purge

### Requirement: Generic bidirectional Relations
For V1, core SHALL store and traverse the bidirectional Relation model in [the core model](../core-model/spec.md), including targets by Ref or declared natural key and unresolved edges. Relation semantics MUST come from Profile declarations rather than domain-specific core logic.

#### Scenario: Natural-key Relation resolves after target arrival
- **WHEN** a Resource is stored with a natural-key Relation whose target is absent and a matching target arrives later
- **THEN** traversal resolves the Relation without rewriting domain-specific core code

#### Scenario: Unresolved Relation remains observable
- **WHEN** no Resource matches a stored natural-key Relation
- **THEN** the Relation remains queryable as unresolved

### Requirement: Explicit Realm, Source, Account, and Grant bindings
For V1, the system SHALL implement the Source and Realm behavior in [the core model](../core-model/spec.md) and [Realm and Source management](../realm-and-source-management/spec.md): every Source belongs to exactly one explicitly selected existing user-created Realm, and authenticated Sources resolve credentials only through an explicit compatible Grant binding. Each authenticated Account MUST have a stable non-empty external identity unique within its provider; repeated authorization of the same `(provider, external identity)` MUST reuse that Account and update its one stable Grant in place. A Grant belongs to exactly one Account/provider and records normalized scopes; multiple compatible Sources MAY reuse one Grant. Initialization MUST NOT seed or imply a `global` Realm.

Source creation SHALL accept `--account` as an exact Account label or Account id, resolved only among Accounts matching the Adapter's declared provider; private Grant ids MUST NOT be public selectors. Every Source SHALL carry one label defaulting verbatim to `<account-label>-<adapter-tail>` (the Adapter id segment after the provider dot), or `<adapter-tail>` when the Adapter requires no Account, with no normalization. Source labels MUST be unique globally; a collision MUST fail as invalid usage naming the taken label and suggesting `--label`, never auto-suffixing or prompting. Source-referencing commands SHALL accept the Source label wherever a Source id is accepted. When an Account is removed, bound Sources keep their configuration with a cleared Grant binding and surface authentication failure through existing status machinery.

#### Scenario: Source creation requires an existing Realm
- **WHEN** a caller creates a Source without an existing Realm
- **THEN** creation fails with an actionable error and no Source is stored

#### Scenario: Authenticated Source uses its linked Grant
- **WHEN** an authenticated Source performs sync or provider I/O
- **THEN** credentials are resolved through that Source's compatible `grant_id` rather than a global or most-recent Grant

#### Scenario: Reauthorization reuses Account identity
- **WHEN** the same stable external provider identity authorizes again
- **THEN** one Account still owns one Grant whose id is unchanged and existing Source bindings remain valid

#### Scenario: Compatible Grant is shared
- **WHEN** mailbox and calendar Adapters from one provider require scopes contained by one Grant
- **THEN** Sources using both Adapters may explicitly bind that Grant without duplicating the Account or secrets

#### Scenario: Default Source label composes account and adapter
- **WHEN** a `google.mailbox` Source is created with `--account work` and no `--label`
- **THEN** its label is exactly `work-mailbox`

#### Scenario: Source label collision is a hard error
- **WHEN** a second Source would receive an already-taken label
- **THEN** creation fails naming the taken label and suggesting `--label`, and no Source is stored

#### Scenario: Account label resolves within the Adapter's provider
- **WHEN** `source add google.mailbox --account work` runs while Google and Microsoft Accounts exist
- **THEN** only Google Accounts are candidates for `work` and a Microsoft Account is never selected

### Requirement: Transactional sync bookkeeping
For V1, sync-capable Adapters SHALL emit normalized operations that core validates and applies transactionally as specified in [sync operations](../sync-operations/spec.md). Core MUST record each sync run and MUST advance the durable cursor only after associated Resource, field, chunk, Relation, and tombstone writes commit.

#### Scenario: Successful sync commits data and cursor
- **WHEN** a sync Adapter completes after emitting valid operations
- **THEN** core commits the operations, records a completed sync run, and advances the Source cursor

#### Scenario: Failed sync does not advance the cursor
- **WHEN** applying emitted operations fails or the Adapter terminates with an error
- **THEN** core records the failed run and leaves the previous durable cursor unchanged

### Requirement: Provider-neutral storage model
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

All resource persistence uses generic core tables: resources (envelope + payload JSON), field index rows, chunks + FTS, relations, cached Artifact-byte metadata, plus the existing source/sync bookkeeping tables. Profile-derived Artifact descriptors are not sync-owned rows; cached byte metadata is written only by the download path. Per-domain tables and per-adapter table namespaces MUST NOT exist. A namespaced per-extension storage API MAY be added later as a new surface without changing this contract.

Resources carry an origin class: `synced` (produced by sync runs, subject to tombstones) or `adhoc` (cache entries produced by retrieval or remote search; evicted, never tombstoned). Remote search hits MAY be cached envelope-only; a subsequent retrieve fills the payload. A later sync of the same ref upgrades the row to `synced`.

#### Scenario: All persisted Resources use generic core storage
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Separation of searchable and provider data
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The generic storage model separates searchable metadata, extracted body/chunk text, optional raw provider payloads, Profile-derived Artifact descriptors, and cached Artifact bytes. Resource payload JSON carries the fields from which Profiles derive descriptors; chunks hold searchable text; optional raw records hold provider support data; and the Artifact cache and its metadata are written only by the download path. Profile exports are rendered or streamed separately and do not enter the Artifact cache.

#### Scenario: Resource content is stored in the appropriate generic projection
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Raw provider payload retention
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Raw provider payload storage is OPTIONAL support data for debugging, audit, and resync diagnostics.

When enabled, raw payload retention MUST be purgeable. Raw provider payloads MUST NOT be the primary search contract.

Raw payload retention MUST be off by default. Enabling it is an explicit per-source or global opt-in. This protects the local-first promise from accidentally hoarding entire provider responses on disk.

#### Scenario: Raw payload retention is opt-in and purgeable
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Persisted time representation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

All timestamp columns in core bookkeeping and index tables MUST be `INTEGER` milliseconds since the Unix epoch in UTC. SQLite has no first-class datetime type; integer ms gives stable sort, cheap range queries, and trivial arithmetic. Profile payload fields MAY use schema-defined representations such as RFC 3339 instants or ISO local dates.

Conversion of core timestamp columns to RFC 3339 happens only at output boundaries (`--format json`, log records). Adapters MUST normalize provider time values into Profile payload schemas and MUST NOT persist provider-formatted strings into core bookkeeping or index columns.

#### Scenario: Persisted and output timestamps use their required representations
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Identifier generation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

All opaque ctxindex-owned primary keys MUST be ULIDs (Crockford base32, 26 characters, time-ordered). This covers `resources.id`, `sync_runs.id`, `sync_run_checkpoints.id`, `accounts.id`, `account_identities.id`, `sources.id`, `grants.id`, `artifacts.id`, and equivalents. A Realm with a human slug SHALL use that slug as `realms.id`; a Realm without one MUST use a ULID.

Provider identifiers MUST NOT serve as core primary keys. They MAY appear in Source-scoped Resource Refs, Resource envelope metadata, or typed Profile fields projected into field-index rows. Core MUST NOT require a separate external-reference table.

ULIDs MUST be generated client-side from a single library helper. SQL-generated ids MUST NOT be used.

#### Scenario: Core and provider identifiers remain separate
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Bounded concurrent Resource materialization
Resource batch materialization SHALL coordinate writers across processes through the shared SQLite database, SHALL wait no longer than the configured five-second busy bound to acquire a write reservation, and SHALL atomically commit or roll back every Resource and its derived fields, chunks, and Relations in the batch. Repeated Refs in one batch MUST produce one stored Resource identity and one complete set of projections.

#### Scenario: Concurrent batches materialize completely
- **WHEN** separate ctxindex processes materialize overlapping Resource batches against one database within the supported contention bound
- **THEN** every batch commits without exposing a SQLite busy error, overlapping Refs remain deduplicated, and no Resource is observable with partial projections

#### Scenario: Batch projection failure rolls back all Resources
- **WHEN** deriving or storing one Resource projection fails within a batch
- **THEN** no Resource or derived projection from that batch is committed

#### Scenario: Write contention exhausts the bound
- **WHEN** another writer prevents a Resource batch from acquiring its reservation for the full configured bound
- **THEN** storage fails with an actionable normalized `storage_busy` error and does not expose raw SQLite busy or lock text

### Requirement: Canonical database lease enforces exclusive SQLite ownership
Before opening SQLite on a platform with a supported retained-lease backend, a production daemon MUST hold an exclusive retained kernel file lease keyed by the canonical SQLite path after symlink/alias resolution. Every direct production SQLite opener on that platform MUST acquire and retain a shared lease on the same key from before database open until after database close. Multiple shared direct owners MAY coexist; they MUST block daemon exclusivity, and daemon exclusivity MUST block every direct opener. A daemon MUST retain exclusivity for the complete lifetime of its open handle, including shutdown timeout, and release it only after the handle is closed or by process termination.

On Darwin the permanent lock file MUST be `<canonical-sqlite>.owner.lock`, opened through `node:fs` with `O_EXLOCK | O_NONBLOCK` for daemon ownership or `O_SHLOCK | O_NONBLOCK` for direct ownership and mode `0600`. Acquisition MUST reject a symlink, non-regular file, wrong uid, or non-private mode. The lock file MUST NOT be unlinked. Kernel release after normal exit or SIGKILL MUST make it immediately reacquirable. An unsupported platform MUST reject daemon startup before SQLite open; because no daemon can own the database there, legacy direct commands MUST retain their pre-prototype unleased behavior. An unavailable locking primitive or unsupported filesystem on Darwin MUST fail closed before any production SQLite open.

The permanent lease file MUST NOT publish or supply runtime-owner attribution. Conflict reporting MUST remain holder-neutral because lease-file contents cannot be bound to the retained kernel-lock holder and may be stale, including while a shared holder owns the lease.

When exact-tuple metadata or a test override selects RPC for the partial slice, the command MUST NOT fall back to direct open. Before every direct/unconverted stateful CLI path composes a runtime or opens SQLite, it MUST attempt retained shared acquisition for the canonical database. Exclusive conflict MUST fail `prototype_unsupported` with exit `50` before database open. Successful acquisition MUST remain held until after close, while other direct behavior remains unchanged. Test-only storage MAY open an isolated database not owned by a live production daemon.

#### Scenario: Client performs a storage-backed operation
- **WHEN** a local client invokes a storage-backed operation for a state root with a ready daemon
- **THEN** the daemon performs the storage access and the client process does not open SQLite

#### Scenario: Selected daemon route is unreachable
- **WHEN** exact-tuple metadata or a test override selected RPC and no ready daemon is reachable
- **THEN** the client reports daemon unavailability and does not open SQLite as a fallback

#### Scenario: Unconverted stateful command is fenced
- **WHEN** an unconverted stateful command targets a canonical SQLite path whose database lease is held by a daemon
- **THEN** it fails `prototype_unsupported` with exit 50 before composing a direct runtime or opening SQLite

#### Scenario: Unconverted command retains direct behavior after shared acquisition
- **WHEN** an unconverted stateful command successfully acquires a shared lease for its canonical SQLite path
- **THEN** it acquires a shared database lease, retains it around open/use/close, and otherwise preserves existing direct behavior

#### Scenario: Direct processes block daemon acquisition
- **WHEN** one or more legacy direct stateful processes hold shared leases for the canonical SQLite path
- **THEN** daemon exclusive acquisition fails before SQLite open until every shared owner closes

#### Scenario: Process death releases the retained lease
- **WHEN** a lease-owning process is terminated by SIGKILL
- **THEN** the kernel releases its lock and a later compatible owner can acquire immediately without deleting or aging the permanent lock file

#### Scenario: Unsafe or unsupported lock fails closed
- **WHEN** the lock target is a symlink, non-regular, wrong-owner, non-private, or a supported platform's filesystem cannot provide the required retained lock
- **THEN** the process fails before opening SQLite

#### Scenario: Unsupported platform retains legacy direct behavior
- **WHEN** the operating system has no retained-lease backend and a direct CLI command has not selected a daemon
- **THEN** daemon startup remains unavailable and the direct command opens SQLite through its pre-prototype path without asserting a retained lease

#### Scenario: Different state roots share one data root
- **WHEN** daemons with different canonical state roots resolve the same canonical SQLite path
- **THEN** at most one holds the database lease and opens SQLite

#### Scenario: Shutdown timeout keeps the database fenced
- **WHEN** shutdown times out waiting for a non-cooperative request
- **THEN** the daemon retains its open database handle and database lease and no other production process may open that SQLite path

#### Scenario: Isolated storage test remains independent
- **WHEN** an automated test opens a database under a test-only isolated state root with no live production daemon for that root
- **THEN** the test may exercise storage directly without weakening production daemon ownership
