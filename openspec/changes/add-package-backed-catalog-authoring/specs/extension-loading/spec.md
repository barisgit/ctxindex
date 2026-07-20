## ADDED Requirements

### Requirement: Catalog root discovery uses declared package entry modules

Trusted Catalog build and install SHALL discover Extension and Catalog roots
only from package-declared entry modules after the canonical installer has
materialized the exact package. A module MAY expose both Extension and Catalog
roots. Undeclared files, sibling exports, and nested Catalog
values SHALL NOT be discovered implicitly.

Catalog add, refresh, list, show, search, and startup SHALL NOT perform this
discovery or import any Catalog-controlled module.

#### Scenario: One module exposes Extension and Catalog roots

- **WHEN** a declared module exports both root kinds during trusted build or
  exact install
- **THEN** discovery returns both for explicit exact selection without installing
  siblings implicitly

#### Scenario: Undeclared file exports a Catalog

- **WHEN** a package contains a Catalog export in a file absent from its declared
  entry modules
- **THEN** build and install ignore that file

### Requirement: Catalog package installation delegates to canonical exact replay

Catalog installation SHALL delegate source replay, declared-module discovery,
exact selection, validation, managed publication, collision enforcement, and
record persistence to the canonical generic installer's `installExact`
operation.

Literal entries SHALL select by exact module, Catalog id, entry index, and
Extension id after author-package replay. Package entries SHALL select the exact
Extension id after package replay. Neither form SHALL make sibling roots active.

#### Scenario: Catalog package entry is installed

- **WHEN** a trusted Catalog install selects a package-backed entry
- **THEN** the canonical installer reproduces and publishes it using its recorded
  exact source, sanitized lock, package root, and materialization digest

#### Scenario: Literal author package is installed

- **WHEN** a trusted Catalog install selects a literal entry
- **THEN** the canonical installer replays the author package, verifies the exact
  locator, and publishes complete managed runnable bytes

## MODIFIED Requirements

### Requirement: Installed Catalog Extension loading and provenance

Startup SHALL load Catalog-curated Extensions only from the package root and
materialization identified by the authoritative generic installed-extension
record. It SHALL report the record's optional Catalog curation provenance
together with exact generic source provenance.

Startup SHALL NOT read a Catalog snapshot to reconstruct an Extension, invoke
Bun, fetch a source, resolve dependencies, import an author checkout, scan for
alternate generations, or repair records implicitly. There SHALL be no active
generation pointer or Catalog-specific execution state.

#### Scenario: Catalog-curated Extension starts offline

- **WHEN** a Catalog-curated package or literal Extension has a valid generic
  record and managed materialization while network, Bun, and Catalog sources are
  unavailable
- **THEN** it loads from managed bytes and reports its stored Catalog and exact
  source provenance

#### Scenario: Generic record document is corrupt

- **WHEN** the strict generic record document cannot be validated
- **THEN** managed Extension loading fails closed without scanning managed bytes
  for a replacement record

### Requirement: Missing or invalid installed snapshots degrade without fetch

Startup SHALL degrade invalid managed materializations without fetch. When a
valid generic record references a missing, altered, or unloadable managed
materialization, startup SHALL degrade that Extension with a deterministic
record/path error and SHALL continue according to the existing per-Extension
degradation contract. It SHALL NOT fetch, invoke Bun, consult Catalog snapshots,
or mutate installed state.

#### Scenario: Generic execution materialization is missing

- **WHEN** a valid Catalog-curated generic record references managed bytes that
  are absent
- **THEN** startup reports that Extension as degraded and performs no recovery or
  acquisition
