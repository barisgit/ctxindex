# module-architecture Specification

## Purpose
TBD - created by archiving change deepen-module-architecture. Update Purpose after archive.
## Requirements
### Requirement: Implementation follows explicit module ownership
The repository MUST organize implementation by the domain owner of the behavior, as detailed by `IMPLEMENTATION.md`, and MUST keep composition roots free of provider-specific schemas and operation implementations.

#### Scenario: Built-in Source Adapter locality
- **WHEN** a maintainer inspects a built-in Source Adapter
- **THEN** its definition, configuration, operations, provider helpers, and focused tests are located in that Adapter-owned module
- **THEN** the built-in Extension composition root only bundles Profile and Adapter definitions

### Requirement: Internal reorganization preserves public seams
Architecture cleanup MUST preserve declared package subpath names, the public Extension SDK value/type surface and authoring inference, CLI behavior and exit codes, storage schema, and provider request behavior unless a separate capability change explicitly modifies them. Unreachable symbols in private workspace packages MAY be removed.

#### Scenario: Existing consumers after reorganization
- **WHEN** workspace packages, the CLI, and an external compiled Extension use their declared public imports and workflows
- **THEN** they compile and behave identically without importing internal implementation paths

### Requirement: Architecture checks cover owned entrypoints
Automated verification MUST discover and validate all production CLI command entrypoints and MUST enforce the repository's package dependency direction and Adapter composition locality without a hand-maintained exception list.

#### Scenario: New production command or Adapter implementation
- **WHEN** a production CLI command or built-in Adapter implementation is added
- **THEN** architecture verification includes it automatically
- **THEN** a misplaced implementation or an oversized command composition module fails verification

### Requirement: Runtime code and manifests contain no dormant prototype surface
Production modules and runtime dependency manifests MUST exclude unreachable prototype contracts, compatibility-only aliases, and dependencies unused by that package's runtime or tests.

#### Scenario: Repository health verification
- **WHEN** the architecture and package gates run
- **THEN** no legacy sync-operation implementation, forbidden Adapter-table cleanup path, dead provider client surface, or unused direct runtime dependency remains

