## ADDED Requirements

### Requirement: Installed Catalog Extension loading and provenance
The system SHALL load installed Catalog Extensions from their exact persisted Catalog ID, commit, and inline source path through the same runtime validation and atomic registry activation used by explicit-path Extensions. Extension listings MUST include installed Catalog provenance sufficient to identify the Catalog, repository, commit, and manifest entry while retaining deterministic ordering.

#### Scenario: Installed Catalog Extension loads offline
- **WHEN** valid installed provenance and its immutable snapshot exist at startup
- **THEN** the Extension loads through the normal validation seam without repository access and its listing includes provenance

### Requirement: Missing or invalid installed snapshots degrade without fetch
If installed Catalog provenance refers to a missing or invalid snapshot, source path, or Extension definition, the loader MUST report an existing-style Extension diagnostic, MUST NOT fetch or mutate Catalog state, and MUST preserve Sources, Resources, snapshots, and other installed Extensions.

#### Scenario: Installed snapshot is missing at startup
- **WHEN** an installed provenance record refers to a snapshot absent from local data
- **THEN** the loader reports an unavailable Extension diagnostic, performs no repository access, and preserves materialized data

