## MODIFIED Requirements

### Requirement: Fresh generic Resource storage
For V1, the system SHALL create a fresh local schema implementing this provider-neutral storage contract: Resources, typed field index rows, chunks plus full-text search, Relations, cached Artifact-byte metadata, and Source/Sync bookkeeping. Per-domain tables, Adapter-private tables, and prototype-schema migration or compatibility paths MUST NOT be created.

#### Scenario: Profile-defined Resource is materialized generically
- **WHEN** an Adapter emits a valid Resource for a loaded Profile
- **THEN** core stores its envelope and payload and transactionally replaces its Profile-derived fields, chunks, and Relations using only generic core storage

#### Scenario: Fresh database replaces prototype state
- **WHEN** V1 storage is initialized without a current schema
- **THEN** the system creates the V1 generic schema without attempting to migrate a prototype database

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
