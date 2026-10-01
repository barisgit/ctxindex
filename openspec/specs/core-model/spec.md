# Core Model Specification

## Purpose
Define the timeless product boundary, ubiquitous core entities, Resource identity and lifecycle, local-first invariants, durability, distribution, and security posture.
## Requirements
### Requirement: Normative product scope
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex is a local personal-context gateway. It is the interface through which agents and users discover, retrieve, locally materialize, and perform typed Actions on user-owned context from external services and local files. Indexing searchable local copies is one implementation strategy for fast local discovery, not the product definition.

ctxindex defines:

- a resource/profile model for mail, calendar events, tasks, files, and arbitrary extension-defined domains;
- a profile vocabulary contract through which all domain semantics and typed Action contracts reach core;
- a source adapter contract with capability flags (sync, remote search, retrieval, download) and Profile Action implementations, used identically by bundled and extension adapters;
- an extension loading model for user-provided profiles and adapters;
- a stable ref grammar addressing resources independent of index state;
- normalized resource/chunk/tombstone operations emitted by source adapters;
- local full-text and field search over normalized content, with optional provider-side (remote) search;
- Source-scoped Profile-derived Artifact descriptors and a managed content-addressed cache for Artifact bytes downloaded on demand;
- export of resources to portable formats declared by profiles;
- local account, grant, realm, source, sync, search, and Action behavior.

ctxindex does not define:

- a SaaS service or remote canonical store;
- agent workflow policy or arbitrary provider automation outside typed Profile Actions;
- extension-registered arbitrary CLI subcommands (deferred by [accepted design decisions D1 and D18](../../../docs/design/2026-07-13-context-access-layer.md));
- a universal sync protocol for arbitrary applications.

Milestone documents (`docs/milestones/`) MAY further restrict the runtime feature set for a given release without weakening any normative requirement in this spec.

#### Scenario: Product behavior remains within the normative scope
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Requirement keyword interpretation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** are normative only when written in all capitals.

#### Scenario: Normative keywords are interpreted consistently
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Core domain model
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

- An **Extension** is one distributable, atomically activated plain definition that composes any number of imported Source Adapters and OAuth Apps plus optional standalone Providers and Profiles. It MAY declare one passive documentation sidecar that remains separate from runtime definition identity and behavior. It has no runtime Extension dependency graph. Built-in and external Extensions have identical authoring, collection, validation, and activation semantics; only acquisition and distribution differ.
- A **Provider** is an ID-addressed declaration of one external authority and exactly one currently supported direct authentication form, `oauth2` or `none`. At most one semantically distinct Provider per id may be active. Package version, integrity, and physical location are provenance, not Provider identity.
- An **OAuth App** is an Extension leaf authored with one exact imported OAuth2 Provider and `{ label, config }`, or a local secret-backed BYOA record. Its identity is `(providerId,label)`. Extension Apps require public registration policy; confidential Apps remain local or future hosted configuration. Duplicate identities MUST reject and BYOA MUST NOT shadow.
- A **Profile** is a versioned schema-backed domain declaration. Authors bind it by importing the exact Profile value. Profiles are the ONLY mechanism for domain semantics; core MUST NOT contain domain-specific code paths. `@ctxindex/profiles` is an ordinary library, not an always-selected Extension.
- A **Source Adapter** connects one collection type. It declares capability flags, config, exact imported Profiles, operations, and Actions. A Provider-backed Adapter imports exactly one Provider and declares only Adapter-specific Provider access allowed by that Provider auth kind plus Provider egress. A providerless Adapter has no Provider, Account, Grant, auth, Provider access, or Provider egress contract.
- An **Action** is a typed provider-side mutation declared by a Profile and implemented by a Source Adapter through a specific Source.
- An **Account** is one stable authenticated identity within a Provider. It is authorized through one explicitly selected OAuth App where OAuth2 is required.
- A **Grant** is private local state containing normalized permissions/token references and a Grant-owned snapshot of the exact OAuth App configuration selected for an Account. It MUST NOT be agent-facing configuration or inventory vocabulary.
- A **Realm** is a user-defined context grouping Sources that should be searched and reasoned about together.
- A **Source** is one labeled configured connection using one Source Adapter and belonging to one Realm.
- A **Resource** is one context unit emitted by a Source: an envelope plus validated versioned Profile payload.
- A **Ref** is `ctx://<source-id>/<adapter-opaque-suffix>` for one Resource.
- An **Artifact** is a Source-scoped, Profile-derived descriptor for downloadable bytes associated with one Resource.

An Extension root MUST transitively contribute Provider and Profile leaves reachable through its imported Adapters and OAuth Apps. Explicit Provider/Profile arrays MAY contribute standalone leaves not otherwise reachable. Package manifests and exact TypeScript imports own dependency acquisition; ctxindex MUST NOT expose `extensionRef`, `providerRef`, `profileRef`, or an Extension dependency graph.

The active registry MUST validate complete selected root graphs before mutation. Stable ids MUST remain semantic identity; Profile identity remains `(id,version)`. Repeated encounter of the exact same imported non-App object MAY coalesce as evidence of exact reuse, but object identity MUST NOT be a semantic key, precedence rule, or winner between distinct values. Distinct same-identity values containing any function or Zod schema MUST conflict because V1 has no package-authenticated per-leaf equivalence evidence. Distinct genuinely pure declarative values MAY coalesce only when canonical structural equality proves them equal. OAuth App identity duplicates MUST always conflict, including repeated reference to the same App object.

Separate physical SDK/Zod copies MUST remain authoring/type-compatible and structurally collectable. Their executable/schema-bearing definitions MUST NOT coalesce merely because root version, integrity, commit, path, provenance, or function text matches. Root provenance MUST be retained only for diagnostics and MUST NOT participate in leaf identity or equivalence. Conflicts MUST reject without mutation; load order, origin priority, `instanceof`, and object identity MUST NOT choose a winner.

Definition factories MUST return shallow plain structurally validated values with stable kind discriminators and exact imported-value inference. Provider, Profile, Adapter, and OAuth App definitions MUST NOT embed documentation. Extension documentation MUST use the separately owned passive sidecar contract and, after successful documentation validation, MUST NOT change definition identity, activated definition semantics, or runtime operations.

#### Scenario: Exact imported values preserve authoring inference
- **WHEN** an Adapter or OAuth App receives an imported Provider or Profile definition
- **THEN** TypeScript retains the imported literal ids, Profile versions, schemas, config, capability, and Action types without a string-reference fallback

#### Scenario: Reachable leaves activate transitively
- **WHEN** an Extension contains an Adapter importing one Provider and two Profiles
- **THEN** complete-registry collection includes those exact leaves without an Extension dependency declaration or duplicate explicit arrays

#### Scenario: Standalone leaf is explicit
- **WHEN** an Extension intentionally publishes a Profile not reachable through an Adapter or OAuth App
- **THEN** the Extension may list that exact Profile value in its explicit standalone Profiles array

#### Scenario: Exact imported object reuse may coalesce
- **WHEN** two reachable graph paths contain the exact same imported non-App Profile object
- **THEN** validation may retain one contribution as exact reuse without treating its object identity as a semantic key or winner

#### Scenario: Distinct executable copies conflict
- **WHEN** separate physical packages contribute distinct same-id Profile or Adapter values containing a Zod schema or function
- **THEN** validation rejects because executable/schema equivalence is unproven, regardless of matching root provenance or function text

#### Scenario: Distinct pure declarative copies may coalesce
- **WHEN** distinct same-id values contain no function or Zod schema and canonical structural equality proves them equal
- **THEN** validation may coalesce them without using load order or root provenance

#### Scenario: Providerless Adapter has no authorization model
- **WHEN** a credential-free local Adapter is activated without a Provider
- **THEN** it requires no Account or Grant and exposes no auth, Provider scopes, or Provider egress declaration

#### Scenario: OAuth App identity never shadows
- **WHEN** an Extension App and local BYOA App share one `(providerId,label)`
- **THEN** activation rejects the duplicate without choosing a winner

#### Scenario: Passive documentation does not alter runtime identity
- **WHEN** an Extension declares a valid passive documentation sidecar
- **THEN** after successful documentation validation, the sidecar is projected separately without changing definition identity, activated definition semantics, or runtime operations

### Requirement: Resource identity, deletion, and Relations
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Core resource row IDs MUST be generated by ctxindex, not copied from provider IDs. The public addressing and identity surface is the Source-scoped Resource ref; internal row ids MUST NOT appear in agent-facing output where a ref is available.

Provider and local identifiers MAY be declared as typed Profile fields. For `mail.message`, the normalized RFC `Message-ID` header value is the typed `rfcMessageId` Profile field when present. Such fields MAY be searched or used as generic Relation natural keys, but core MUST NOT require a separate first-class external-reference store or a `(source, external kind, external id)` uniqueness tuple.

A local directory source SHOULD identify files primarily by normalized path within the source root. Content hashes SHOULD be used for change detection. An implementation MAY omit file rename detection, in which case a rename is represented as a tombstone for the old path and a new item for the new path.

Deletes of synced resources SHOULD be represented with tombstones rather than immediate hard deletes. Tombstoned resources MUST be excluded from normal search results by default and MAY be included with an explicit deleted/tombstoned filter.

Core MUST provide a generic relation model. A relation links one resource to a target that is either a ref or a natural key (a declared field name plus value, e.g. `rfcMessageId` + RFC Message-ID). Natural-key edges MUST be stored unresolved when no target is present and resolved lazily through the field index on matching Resource arrival or at query time. Resolution MUST allow zero-to-many matches across Sources and Realms. Multiple matches MUST remain distinct Source-scoped Resources; Relation resolution MUST NOT collapse their identities. Dangling edges are legal and MUST be queryable as unresolved. Relations MUST be traversable in both directions; "resources related to X by relation R" is a required query primitive. Reply-tree threading (message `parent` edges from In-Reply-To/References) and thread membership (`conversation` edges) are profile-declared relations, not core mail knowledge.

When a resource's extracted content changes, an implementation SHOULD replace that resource's chunks and field-index rows wholesale. Chunk IDs MUST be generated by ctxindex. The tuple `(resource_id, chunk_index)` SHOULD be unique.

#### Scenario: Typed natural key resolves across Sources without collapsing Resources
- **WHEN** a Relation targets an `rfcMessageId` value matched by Resources from multiple Sources
- **THEN** resolution returns every matching Resource while preserving each distinct Source-scoped Ref

#### Scenario: Resource identity needs no separate external-reference store
- **WHEN** a Resource carries provider or local identifiers as typed Profile fields
- **THEN** core addresses the Resource by its Source-scoped Ref and may resolve declared natural keys through the field index without a separate external-reference identity tuple

### Requirement: Local-first boundary
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST behave as a local searchable mirror/index. External services and the filesystem remain canonical.

Source adapters MUST NOT use exported files as their primary storage contract. File export MAY be offered as a separate feature.

A local directory source MUST index files in place and MUST NOT copy every original file into ctxindex by default. It MAY store extracted text, chunks, hashes, and metadata in SQLite for search. Stored extracted text, chunks, and full-text indexes SHOULD be treated as purgeable and rebuildable from the canonical filesystem source.

Artifact bytes enter the managed content-addressed cache only when download is requested. Cached bytes are purgeable; the Source-scoped Profile-derived Artifact descriptor remains available for a later download.

Purging cached Artifact bytes preserves the Resource and its Profile-derived descriptor. Profile exports are rendered or streamed separately and do not enter the Artifact cache. Optional raw provider payload retention is separate support data, not an Artifact.

#### Scenario: Canonical external data remains external while local projections stay rebuildable
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Cross-source duplicates
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Under the current contract, copies of provider context materialized through different Sources MUST remain separate Resources with separate Source-scoped Refs. Natural-key Relations MAY resolve to all such copies without collapsing identity. Cross-Source Resource collapse, canonical identity selection, and merge policy are deferred and MUST NOT be inferred without a future explicit capability and storage contract.

#### Scenario: Cross-Source copies remain distinct
- **WHEN** multiple Sources materialize context with the same `rfcMessageId` natural-key value
- **THEN** each copy retains its own Resource Ref while Relations may resolve to all matching copies

### Requirement: Tombstones and retention
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Deleted synced resources MUST be retained as tombstones (`deleted_at` set; row not removed). Search MUST exclude tombstoned resources unless an `--include-deleted`-equivalent filter is passed. `adhoc`-origin rows are cache entries: they are evicted (by purge or cache policy), never tombstoned.

ctxindex MAY ship a `maintenance purge --tombstones --older-than <duration>` command to hard-delete tombstoned rows. Tombstone purging MUST NOT run automatically.

#### Scenario: Deletion preserves tombstones until an explicit purge
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Backup and export stability
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The baseline supported backup procedure is: stop active syncs and, when a daemon owns the canonical SQLite path, request clean shutdown and wait for active operations to settle, SQLite to close, and both database and lifecycle leases to release; then copy the SQLite file and the secrets store file if one is used. Endpoint disappearance or shutdown timeout is insufficient. Copying the database while the daemon owns it is not supported.

ctxindex MAY ship an `export` command. Any such export format MUST be either declared stable in a release document or marked unstable. Unstable export formats SHOULD NOT be relied on for cross-version restore.

Beginning with the first released V1 schema, core-owned migrations MUST keep `ctxindex.sqlite` upgradable between released versions. Prototype databases created before V1 have no migration guarantee, and Adapters MUST NOT register migration namespaces.

#### Scenario: Backup and export behavior remains explicit
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: Daemon-backed database is copied safely
- **WHEN** an operator follows the baseline backup procedure while a daemon owns the canonical SQLite path
- **THEN** the copy begins only after clean shutdown has settled active operations, closed SQLite, and released both leases

### Requirement: Distribution invariance
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MAY be distributed via package registries, compiled binaries, or source checkouts. The chosen distribution method MUST NOT change the on-disk schema or CLI surface beyond what is documented in this spec.

A specific release's chosen distribution channel is captured in its milestone document.

#### Scenario: Distribution does not alter durable contracts
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: License and security posture
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

License: **MIT**.

ctxindex is local-first. The reference implementation MUST NOT:

- emit telemetry, analytics, crash reports, or update pings;
- contact any host that is not a globally approved host declared by the active authorization flow or Source Adapter;
- store user-visible secrets outside the configured secrets store (keychain or encrypted file).

ctxindex MUST:

- keep all indexed content in the local SQLite database under the user's home directory;
- store secrets only as references in TOML and SQLite, with cleartext only in the secrets store;
- redact known sensitive fields at the logger boundary;
- treat the SQLite file, the log directory, and the secrets store as user-controlled files (`0600` for secrets-related files; `0700` for their parent directories where feasible).

Network egress is limited to globally approved identity/provider APIs needed to authorize selected Adapters or operate registered Sources. A declarative provider/Adapter host list MUST narrow each operation before the global egress chokepoint. Adding a provider that talks to a non-provider host requires a normative capability-spec change.

#### Scenario: Local data and network boundaries are enforced
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
