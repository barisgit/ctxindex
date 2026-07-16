# Extension Loading Specification

## Purpose
Define trusted Extension loading, validation, compiled-binary compatibility, and degraded behavior when an Extension is unavailable.

## Requirements

### Requirement: Explicit-path trusted Extension loading
For V1, the system SHALL load trusted external TypeScript or JavaScript Extensions from explicit local paths by in-process dynamic import as specified in SPEC §3d. External Extensions MUST use public definition contracts, MUST NOT import ctxindex runtime code, and SHALL receive runtime facilities only through host-provided capability contexts.

#### Scenario: External TypeScript Extension loads by explicit path
- **WHEN** configuration names a valid trusted external `.ts` Extension path
- **THEN** the system imports, validates, and activates its definitions in-process

#### Scenario: Undeclared discovery is not required
- **WHEN** an Extension exists only in an auto-discovery, git, or package-registry location
- **THEN** V1 does not need to discover or install it unless its local path is explicitly configured

### Requirement: Atomic validation and capability consistency
For V1, core SHALL validate an Extension as a unit before activation, including definition schemas, id uniqueness, supported Profile bindings, and consistency between Adapter capability or Action declarations and implementations as required by SPEC §3c and §3d. An invalid Extension MUST be rejected whole with a diagnostic.

#### Scenario: Missing capability implementation rejects Extension
- **WHEN** an Adapter declares `retrieve` but provides no retrieve implementation
- **THEN** the containing Extension is rejected before any of its definitions activate

#### Scenario: Extra Action implementation rejects Extension
- **WHEN** an Adapter implements an Action not declared by one of its supported Profiles
- **THEN** the containing Extension is rejected with a capability-consistency diagnostic

### Requirement: Compiled binary loads external TypeScript
For V1, the compiled Bun binary SHALL load explicit-path external TypeScript Extensions while running outside the project tree. The project MUST remain pinned to Bun 1.3.14, and the retained D3 compiled-extension regression SHALL pass.

#### Scenario: Relocated binary loads an external Extension
- **WHEN** the D3 regression runs a relocated compiled binary from outside the repository against an external TypeScript Extension with its own dependencies
- **THEN** the Extension loads successfully under Bun 1.3.14

### Requirement: Missing Extension preserves materialized data
For V1, removing or failing to load an Extension SHALL make its Sources unavailable for sync and provider operations while preserving their locally synced Resources as specified in SPEC §3d. Extension absence MUST NOT delete data; deletion requires an explicit Source removal or purge operation.

#### Scenario: Removed Extension degrades to local envelope search
- **WHEN** a previously active Extension is no longer available
- **THEN** its Sources remain listed as unavailable and their synced Resources remain locally searchable with envelope-level degradation where vocabulary is missing

### Requirement: External Extension proves the public seam
For V1, at least one external tenders Extension SHALL load outside the compiled binary and exercise the same public Profile, Adapter, and Extension contracts as bundled definitions.

#### Scenario: Tenders Extension participates through generic operations
- **WHEN** the external tenders Extension is loaded from its configured path
- **THEN** its definitions appear in registries and its Resources can be served through generic ctxindex operations without bundled-only hooks
