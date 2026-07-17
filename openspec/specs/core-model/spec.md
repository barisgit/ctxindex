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
- a managed content-addressed artifact store for attachments, raw records, and rendered exports;
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

- An **extension** is a distributable module providing profiles and source adapters through the public definition API. Bundled (built-in) extensions use the same contract; their only privileges are distributional (always present, loaded first, winning id conflicts with a diagnostic).
- A **profile** is a versioned, schema-backed declaration of one domain shape plus the vocabulary core uses to serve it ([Profile vocabulary](../profile-vocabulary/spec.md)). Profiles are the ONLY mechanism for domain semantics; core MUST NOT contain domain-specific code paths.
- A **source adapter** is code connecting one provider collection type, such as `google.mailbox` or `local.directory`. It declares capability flags, an auth spec, a config schema, and the profiles it emits.
- An **action** is a typed provider-side mutation declared by a profile and implemented by a source adapter through a specific source.
- A **realm** is a user-defined operating context, such as `personal`, `company`, or `university`, used to group sources that should be searched and reasoned about together.
- A **client** is one persisted OAuth application configuration for a provider. Its label is unique within that provider, while its credentials are stored as typed secret references.
- An **account** is one stable external authenticated identity within a provider. It has a globally unique local label; verified addresses are Account Identities, not its identity key.
- A **grant** is the internal stable normalized permission set and secret reference for one account. Each account owns exactly one grant, which reauthorization updates in place; multiple compatible sources MAY explicitly share it.
- A **source** is one labeled configured connection to one collection using exactly one source adapter. Its label is globally unique. Sync is an optional per-source setting; a Source with sync disabled may still participate in remote search, retrieval, download, and supported Actions.
- A **resource** is one unit of context emitted by a source: an envelope (ref, primary profile id+version, title, times, origin) plus validated profile payload(s). The envelope kind IS the primary profile id.
- A **ref** is the stable locator `ctx://<source-id>/<adapter-opaque-suffix>` for one resource, valid whether or not the resource is indexed. The suffix is adapter-owned and opaque to core. Provider-native URIs are envelope metadata, never addressing input.
- A **chunk** is one searchable segment of a resource's extracted content.
- An **artifact** is downloadable bytes (attachment, original record, rendered export) in the managed artifact store.

A source adapter MUST emit normalized core operations for searchable data. Adapters MUST NOT own database tables; all persistence flows through the generic core storage model ([generic storage](../generic-storage/spec.md)). Adapter-specific state lives in the sync cursor and the artifact store.

#### Scenario: Core entities preserve their defined meanings and relationships
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Resource identity, deletion, and Relations
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Core resource row IDs MUST be generated by ctxindex, not copied from provider IDs. The public addressing surface is the Resource ref; internal row ids MUST NOT appear in agent-facing output where a ref is available.

A resource MAY have multiple external references. External references represent provider or local identifiers such as message IDs, thread IDs, RFC822 Message-ID headers, event IDs, or file paths.

Mailbox sources SHOULD store the RFC822 `Message-ID` header as a first-class external reference when present, using an external kind such as `rfc822_message_id`.

External identity uniqueness MUST be scoped by source and external kind:

```text
source_id + external_kind + external_id
```

A local directory source SHOULD identify files primarily by normalized path within the source root. Content hashes SHOULD be used for change detection. An implementation MAY omit file rename detection, in which case a rename is represented as a tombstone for the old path and a new item for the new path.

Deletes of synced resources SHOULD be represented with tombstones rather than immediate hard deletes. Tombstoned resources MUST be excluded from normal search results by default and MAY be included with an explicit deleted/tombstoned filter.

Core MUST provide a generic relation model. A relation links one resource to a target that is either a ref or a natural key (a declared field name plus value, e.g. `internetMessageId` + RFC822 Message-ID). Natural-key edges MUST be stored unresolved when the target is absent and resolved lazily — on arrival of a matching resource (via the field index) or at query time. Dangling edges are legal and MUST be queryable as unresolved. Relations MUST be traversable in both directions; "resources related to X by relation R" is a required query primitive. Reply-tree threading (message `parent` edges from In-Reply-To/References) and thread membership (`conversation` edges) are profile-declared relations, not core mail knowledge.

When a resource's extracted content changes, an implementation SHOULD replace that resource's chunks and field-index rows wholesale. Chunk IDs MUST be generated by ctxindex. The tuple `(resource_id, chunk_index)` SHOULD be unique.

#### Scenario: Resource identity and Relations remain provider-neutral
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Local-first boundary
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MUST behave as a local searchable mirror/index. External services and the filesystem remain canonical.

Source adapters MUST NOT use exported files as their primary storage contract. File export MAY be offered as a separate feature.

A local directory source MUST index files in place and MUST NOT copy every original file into ctxindex by default. It MAY store extracted text, chunks, hashes, and metadata in SQLite for search. Stored extracted text, chunks, and full-text indexes SHOULD be treated as purgeable and rebuildable from the canonical filesystem source.

#### Scenario: Canonical external data remains external while local projections stay rebuildable
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Cross-source duplicates
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

ctxindex MAY collapse resources that share an external reference such as `rfc822_message_id`. Until an implementation does so, each source's copy of a duplicated record is a separate resource. Natural-key relations already join such copies for thread traversal without collapsing identity. The `rfc822_message_id` external ref MUST be stored when present so cross-source collapse can be added without a schema migration.

#### Scenario: Duplicate provider records remain traceable across Sources
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Tombstones and retention
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Deleted synced resources MUST be retained as tombstones (`deleted_at` set; row not removed). Search MUST exclude tombstoned resources unless an `--include-deleted`-equivalent filter is passed. `adhoc`-origin rows are cache entries: they are evicted (by purge or cache policy), never tombstoned.

ctxindex MAY ship a `maintenance purge --tombstones --older-than <duration>` command to hard-delete tombstoned rows. Tombstone purging MUST NOT run automatically.

#### Scenario: Deletion preserves tombstones until an explicit purge
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Backup and export stability
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The baseline supported backup procedure is: stop active syncs, then copy the SQLite file (and the secrets store file if one is used).

ctxindex MAY ship an `export` command. Any such export format MUST be either declared stable in a release document or marked unstable. Unstable export formats SHOULD NOT be relied on for cross-version restore.

Beginning with the first released V1 schema, core-owned migrations MUST keep `ctxindex.sqlite` upgradable between released versions. Prototype databases created before V1 have no migration guarantee, and Adapters MUST NOT register migration namespaces.

#### Scenario: Backup and export behavior remains explicit
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

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
