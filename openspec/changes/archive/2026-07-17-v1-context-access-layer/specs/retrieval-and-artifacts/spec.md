## ADDED Requirements

### Requirement: Complete Resource retrieval by Ref
For V1, `get <ref>` SHALL implement SPEC §10f by returning a complete Resource from local materialization when available and otherwise invoking the owning Source Adapter's `retrieve` capability. Provider-retrieved Resources MUST retain the requested Ref and SHALL be cached as purgeable `adhoc` materializations.

#### Scenario: Locally materialized Resource is returned
- **WHEN** `get` receives a Ref whose complete Resource is stored locally
- **THEN** the command returns that Resource without provider retrieval

#### Scenario: Missing local Resource is hydrated
- **WHEN** `get` receives a valid Ref absent from local storage and the Source supports retrieval
- **THEN** the Adapter retrieves the complete Resource and core returns and caches it as `adhoc`

### Requirement: Thread retrieval uses generic Relations
For V1, `thread get <ref>` SHALL return the union of provider conversation membership and bidirectional `parent` Relation traversal required by SPEC §10f. It MUST present a tree when parent edges exist and otherwise a flat date-ordered list.

#### Scenario: Reply tree is assembled across arrival order
- **WHEN** related Gmail messages have conversation membership and parent Relations that were stored in any order
- **THEN** `thread get` returns their complete union as a reply tree

#### Scenario: Conversation without parent edges is ordered
- **WHEN** conversation members have no resolvable parent Relations
- **THEN** `thread get` returns a flat list ordered by date

### Requirement: Managed Artifact lifecycle
For V1, Artifact bytes SHALL use the content-addressed managed store defined in SPEC §10f, with media type, size, origin Ref, and retention metadata. Download MUST use cached bytes when present and otherwise the Adapter's `download` capability; `--output` MUST copy bytes without transferring store ownership. Sync MUST NOT fetch all Artifact bytes by default, and the store SHALL support explicit purge and disk accounting.

#### Scenario: Uncached Artifact is downloaded and copied
- **WHEN** a caller downloads an uncached Artifact to an output path
- **THEN** the Adapter streams the bytes into the managed store and core copies them to the requested path

#### Scenario: Cached Artifact avoids provider download
- **WHEN** a caller downloads an Artifact whose bytes already exist in the managed store
- **THEN** core serves the stored bytes without provider I/O

### Requirement: V1 Artifact retention is explicit cached state
For V1, every materialized Artifact byte object SHALL use the retention class `cached`. Cached bytes MUST be fetched only on demand, retained indefinitely, and removed only by explicit `ctxindex purge artifacts`. V1 MUST NOT automatically evict Artifact bytes by age, quota, or storage pressure. Purge MUST remove managed bytes and cache metadata without removing the owning Resource or its Profile-derived Artifact descriptor, so a later download can fetch the bytes again.

#### Scenario: Lazy download remains cached
- **WHEN** an uncached Artifact is downloaded successfully
- **THEN** its bytes are stored with retention class `cached` and remain available for cache reuse until explicit purge

#### Scenario: Explicit purge preserves rediscovery
- **WHEN** the caller runs `ctxindex purge artifacts`
- **THEN** managed Artifact bytes and cache metadata are removed while owning Resources and their Artifact descriptors remain available for a later re-download

### Requirement: Profile-declared export
For V1, `export <ref> --format <f>` SHALL resolve formats from the Resource Profile's export map and stream its rendered representation as specified in SPEC §10f. Core MUST NOT maintain domain-specific conversion pipelines, and validated payload JSON MUST always be exportable without a Profile declaration.

#### Scenario: Declared export format is rendered
- **WHEN** a caller requests a format declared by the Resource's Profile
- **THEN** core invokes that Profile renderer and streams the declared media representation

#### Scenario: JSON fallback is available
- **WHEN** a Resource Profile declares no export formats
- **THEN** the caller can still export the validated payload as JSON
