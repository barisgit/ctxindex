# Direct Extension Installation Specification

## Purpose
Define explicit trusted acquisition, immutable provenance, offline loading, and lifecycle behavior for directly installed Extension packages.

## Requirements

### Requirement: Explicit trusted direct package acquisition
The system SHALL accept direct Extension package targets classified explicitly as `npm`, `git`, or `local`. npm targets MUST satisfy the pinned package manager's npm package-spec grammar, Git targets MUST satisfy its Git package-spec grammar, and local targets MUST identify package directories. A relative local target MUST be resolved against the install command's working directory and its normalized absolute origin MUST be retained for working-directory-independent updates. Acquisition MUST occur only during an explicit install or update request, MUST use the pinned package manager to resolve ordinary package dependencies, and MUST NOT require or create a Catalog. The explicit install or update request SHALL be the trust grant for importing and executing arbitrary package code in-process; validation MUST be described as a correctness check rather than a sandbox. Embedded target credentials MUST be rejected and package-manager authentication material MUST NOT be persisted in installation state.

ctxindex MUST NOT resolve an Extension dependency graph, honor an Extension dependency declaration, or automatically install sibling Extension roots. It MUST NOT weaken the package manager's lifecycle-script or trusted-dependency policy.

#### Scenario: npm package is explicitly trusted
- **WHEN** an operator installs an npm target and selects one exact Extension id
- **THEN** the package manager resolves the package and its ordinary dependencies, ctxindex treats that command as the in-process execution trust grant, and no Catalog record is required

#### Scenario: Acquisition is attempted without an explicit lifecycle request
- **WHEN** startup or a read-only command encounters an unmaterialized direct target
- **THEN** the system performs no acquisition or import and reports the Extension unavailable

#### Scenario: Package exports sibling Extensions
- **WHEN** the selected package exports multiple Extension roots
- **THEN** only the exact requested Extension root is installed and no Extension dependency edge is inferred

#### Scenario: Relative local origin survives working-directory changes
- **WHEN** a local package is installed through a relative target and later updated from another working directory
- **THEN** update rereads the normalized origin selected at install rather than reinterpreting the relative argument

### Requirement: Immutable resolved materialization and generic provenance
Every successful direct install or update MUST publish a complete immutable runnable materialization in ctxindex-managed storage. An npm target MUST resolve to an exact version plus available package integrity, a Git target MUST resolve to an exact commit, and a local target MUST resolve to a content digest snapshot. All target kinds MUST retain a materialization/dependency resolution digest sufficient to identify the exact runnable candidate.

The persisted record MUST contain the stable Extension id, source kind, sanitized requested target, exact resolved identity, integrity or content digest, materialization digest, and installation/update time. It MUST NOT persist credentials, package-manager authentication state, or Catalog-shaped provenance. Managed absolute paths MUST be derived rather than persisted.

#### Scenario: Mutable target resolves once
- **WHEN** install resolves an npm range, Git ref, or mutable local package
- **THEN** the resulting record points to an immutable exact materialization and later startup does not observe upstream changes

#### Scenario: Provenance is inventoried safely
- **WHEN** direct installation inventory is rendered as text or JSON
- **THEN** it identifies requested and resolved provenance deterministically without credentials or authentication state

### Requirement: Common exact selection and complete validation
After package-manager materialization, the installer MUST use the common `ctxindex.extensions` manifest-entry resolver, namespace root collector, transitive reachable-leaf collector, exact Extension selector, conservative conflict policy, and complete candidate-registry validator. The requested Extension id MUST identify exactly one collected root. No directly installed origin MAY bypass validation, pre-register leaves, shadow another origin, or win by source priority or install order.

Import and validation MUST occur from staging before persistent installation state changes. A manifest, collection, identity, validation, or complete-registry conflict failure MUST leave the prior active registry, direct-install records, and published materializations unchanged.

#### Scenario: Exact root is absent or ambiguous
- **WHEN** the requested Extension id selects zero or more than one collected root
- **THEN** install fails before publishing installation state

#### Scenario: Candidate conflicts with an active origin
- **WHEN** the selected root conflicts with a built-in, explicit-path, Catalog, or other direct root
- **THEN** complete candidate validation rejects atomically without choosing an origin winner

### Requirement: Atomic per-Extension install and update lifecycle
A direct installation record SHALL be owned by one stable Extension id. Install MUST reject an id that already has a direct record and MUST direct the caller to update. Update MUST use that record's stored source kind and requested target, resolve a fresh candidate only during the explicit update, and atomically replace the old record and materialization only after the replacement complete candidate validates. A same-resolution or same-content update MAY succeed as an idempotent no-op.

Lifecycle mutations MUST be serialized. A failed acquisition, import, validation, conflict check, materialization publication, or record write MUST preserve the prior record and runnable materialization unchanged. Independently installed sibling roots MUST remain independently updateable and uninstallable even when their materialized bytes are internally deduplicated.

#### Scenario: Invalid update preserves old code
- **WHEN** update resolves a candidate that cannot be acquired, imported, selected, or validated
- **THEN** the prior exact installation remains active and its record and materialization are unchanged

#### Scenario: Existing id is installed again
- **WHEN** install selects an Extension id already present in direct installation state
- **THEN** install fails without replacement and reports the explicit update command

### Requirement: Guarded uninstall preserves Source-owned state
Uninstall MUST evaluate the complete candidate registry without the selected direct Extension before changing state. Without force, it MUST fail and list every configured Source whose Adapter would become unavailable. A Source MUST NOT block removal when the post-removal candidate still provides its exact usable Adapter through another valid origin.

Forced uninstall MUST remove the direct activation record and MAY remove only materialization bytes no remaining installation record references. It MUST preserve Sources, Resources, Artifacts, Accounts, Grants, OAuth Apps, sync history, and all other Source-owned or provider-owned data. Affected Sources MUST remain configured and be reported unavailable until compatible Extension code is installed again or the Source is explicitly removed.

#### Scenario: Dependent Source blocks uninstall
- **WHEN** normal uninstall would leave one or more configured Sources without their Adapter
- **THEN** uninstall fails atomically and identifies the blocking Sources without changing records or data

#### Scenario: Forced uninstall retains data
- **WHEN** the operator forces uninstall despite dependent Sources
- **THEN** Extension activation is removed, affected Sources become unavailable, and their materialized data remains intact

### Requirement: Offline startup from pinned direct state
Startup and ordinary read/operation commands MUST load directly installed Extensions only from persisted records and their immutable managed materializations. They MUST NOT invoke the package manager, contact npm or Git, read the original local target, or update installation state. Missing, corrupt, or invalid pinned material MUST produce a provenance-bearing Extension diagnostic, leave affected Sources unavailable, preserve stored data, and allow unrelated valid Extensions to continue loading.

#### Scenario: Original local directory changes after install
- **WHEN** startup runs after the original local target is edited, moved, or deleted
- **THEN** the installed Extension loads from its unchanged immutable materialization without reading the original path

#### Scenario: Pinned materialization is missing
- **WHEN** a direct record refers to absent or corrupt managed material
- **THEN** startup performs no acquisition, reports that Extension unavailable, and preserves all Source and Resource state
