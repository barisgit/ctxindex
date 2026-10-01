## ADDED Requirements

### Requirement: Managed Artifact bytes are Action inputs only after verified caching
A Profile-derived Artifact SHALL become eligible as a Draft attachment input only after its bytes have been materialized in the managed content-addressed store. Eligibility MUST require the descriptor to remain derivable from its complete, non-deleted origin Resource, its Ref and origin to belong to the selected Source, and its cached bytes, size, media type, and content hash to pass existing integrity checks. Action resolution MUST NOT download, copy from an arbitrary path, or otherwise acquire missing bytes.

#### Scenario: Downloaded Artifact becomes eligible
- **WHEN** `artifact download` has cached exact bytes for a valid same-Source descriptor
- **THEN** a later Draft create may consume those verified bytes without provider read access

#### Scenario: Purged Artifact is unavailable to an Action
- **WHEN** a descriptor remains but its cached bytes were purged
- **THEN** Draft attachment validation fails with download guidance before provider mutation

#### Scenario: Descriptor drift invalidates cached input
- **WHEN** a cached Artifact Ref is no longer emitted by its origin Resource's current Profile payload
- **THEN** the Action rejects it even if orphaned cache metadata or bytes remain
