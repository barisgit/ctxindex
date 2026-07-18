## MODIFIED Requirements

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
- extension-registered arbitrary CLI subcommands (deferred by [accepted design decisions D1 and D18](../../../../../docs/design/2026-07-13-context-access-layer.md));
- a universal sync protocol for arbitrary applications.

Milestone documents (`docs/milestones/`) MAY further restrict the runtime feature set for a given release without weakening any normative requirement in this spec.

#### Scenario: Product behavior remains within the normative scope
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
- An **artifact** is a Source-scoped descriptor derived by a Resource's Profile for downloadable bytes associated with that Resource. Artifact bytes enter the managed content-addressed cache only when download is requested. Purging the Artifact cache removes cached bytes and cache metadata while preserving the owning Resource and its descriptor.

Profile exports are rendered and streamed representations and MUST NOT be inserted into the Artifact cache or described as Artifacts unless a future explicit contract defines that behavior. Optional raw provider payload retention is separate support data and MUST NOT be represented as Artifact storage.

A source adapter MUST emit normalized core operations for searchable data. Adapters MUST NOT own database tables; all persistence flows through the generic core storage model ([generic storage](../generic-storage/spec.md)). Adapter-specific state lives in the sync cursor; downloaded Artifact bytes live in the managed content-addressed cache.

#### Scenario: Core entities preserve their defined meanings and relationships
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: Artifact purge preserves descriptor identity
- **WHEN** cached bytes and metadata for an Artifact are explicitly purged
- **THEN** the owning Resource and its Profile-derived Artifact descriptor remain available for a later download

#### Scenario: Export and raw payload paths remain separate
- **WHEN** a Profile export is rendered or optional raw provider payload support is used
- **THEN** neither representation is inserted into the Artifact cache or described as an Artifact without a separate explicit contract
