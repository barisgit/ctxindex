## ADDED Requirements

### Requirement: Typed direct Catalog authoring
The system SHALL provide imported `defineCatalog` and `packageExtension`
factories. A Catalog definition MUST contain a stable id, label, optional
summary, and at most 256 direct entries. Each entry MUST be either one valid
versionless Extension definition or one inert package descriptor containing an
explicit `npm`, `git`, or `local` source kind, sanitized target, and exact stable
Extension id. A Catalog MUST NOT contain another Catalog, a textual Extension
dependency, or an implicit sibling-root reference.

The factories MUST return readonly plain values and perform no filesystem,
package-manager, network, import, or materialization effect. The same Extension
id MUST NOT occur twice within one Catalog. Independent Catalogs MAY curate that
same id and MUST retain independent provenance.

#### Scenario: Mixed Catalog is authored
- **WHEN** an author passes literal Extension values and npm, Git, and contained
  local package descriptors to `defineCatalog`
- **THEN** TypeScript preserves their exact entry types and factory evaluation
  performs no acquisition or code import

#### Scenario: Catalog or dependency ref is nested
- **WHEN** an entry is another Catalog or a textual dependency reference
- **THEN** Catalog validation rejects it instead of traversing or resolving it

### Requirement: Explicit generated Catalog snapshot
An explicit authoring operation SHALL inspect only modules listed in the local
package's strict `package.json#ctxindex.extensions`, select exactly one Catalog
root by stable Catalog id, validate every direct entry, and atomically write one
canonical data-only `ctxindex-catalog.json`. When more than one Catalog root is
available, generation MUST require an exact Catalog id. JavaScript export names
MUST NOT be a selection or persistence contract.

Literal entries MUST compile to their declared module, selected Catalog id,
stable nested entry index, Extension id, and optional summary. Package entries
MUST delegate resolution, dependency materialization, module collection, and
exact Extension selection to the generic installer primitive and copy only its
sanitized requested target and exact resolved provenance into the snapshot.
Generation MUST preserve a prior valid output on any failure and report a
byte-identical output as unchanged. Generic exact dependency-resolution
artifacts MUST be emitted at bounded content-addressed paths contained beside
the output, verified before manifest publication, and referenced only by path,
format, and digest. Catalog code MUST treat their content as inert bytes.

#### Scenario: Package target resolves during generation
- **WHEN** a Catalog package descriptor selects one mutable npm range, Git ref,
  or contained local package and one Extension id
- **THEN** the generic installer resolves and validates it once and the generated
  snapshot records its exact immutable resolution, contained generic
  dependency-resolution artifact, and digests

#### Scenario: Entry module exports multiple roots
- **WHEN** a declared module exports multiple Extensions or Catalogs
- **THEN** generation selects only the requested Catalog and package descriptor
  Extension ids without persisting export names or following nested Catalogs

#### Scenario: Generation candidate fails
- **WHEN** module collection, target resolution, exact selection, validation, or
  canonical snapshot validation fails
- **THEN** generation preserves the prior output and publishes no partial file

### Requirement: Deterministic aggregate Marketplace search
Marketplace SHALL project the stored snapshots of all configured Catalogs as one
aggregate without creating a persisted Marketplace record. Matching MUST use
case-insensitive substring comparison over Extension id and summary. Results MUST
retain one row per Catalog entry and sort by Extension id ascending, Catalog
local name ascending, then exact source locator ascending. Marketplace MUST NOT
collapse duplicate curation, select a preferred source, import code, invoke the
package manager, or materialize a package.

Default search SHALL refresh all configured Catalogs in deterministic local-name
order before projection. `--no-refresh` search MUST remain offline and expose
stored snapshot age. A refresh failure MUST fail the aggregate operation without
emitting a stale success result.

#### Scenario: Duplicate curation is searched
- **WHEN** two Catalogs contain a matching Extension id
- **THEN** Marketplace returns one deterministically ordered row for each Catalog
  provenance rather than choosing a winner

#### Scenario: Stored Marketplace search is requested
- **WHEN** aggregate search uses stored-snapshot policy
- **THEN** it performs no Git, package-manager, registry, original-local-path,
  module import, or state-mutation effect and reports snapshot age per result

## MODIFIED Requirements

### Requirement: Strict bounded Catalog manifest
Each acquired Catalog snapshot MUST contain a UTF-8 generated
`ctxindex-catalog.json` at repository root of at most 256 KiB. The manifest MUST
be strict schema version `2`, reject unknown fields at every level, and contain
only Catalog identity/summary, credential-free generation metadata, and at most
256 versionless Extension entries. Every entry MUST contain stable Extension id,
optional summary, and exactly one variant from this closed set:

- a literal source with one normalized declared module path, Catalog id, and
  non-negative nested entry index; or
- an npm package source with sanitized requested target, exact `version`,
  required `integrity`, one contained content-addressed exact dependency-
  resolution artifact produced by the generic installer, and materialization
  digest;
- a Git package source with sanitized requested target, exact `commit`, one
  contained content-addressed exact dependency-resolution artifact produced by
  the generic installer, and materialization digest; or
- a local package source with normalized contained `path`, required
  `contentDigest`, one contained content-addressed exact dependency-resolution
  artifact produced by the generic installer, and materialization digest.

Author-machine absolute paths, credentials, package-manager authentication,
JavaScript export names, Extension definition versions, registry overrides,
installer commands, nested Catalogs, auth/scopes/hosts, and executable hooks MUST
be rejected. Catalog ids MUST be unique among configured Catalogs and Extension
ids MUST be unique within one manifest.

#### Scenario: Versioned Extension entry is supplied
- **WHEN** a snapshot entry includes an Extension definition version or a
  versioned Extension selector
- **THEN** the entire Catalog candidate is rejected without acquisition

#### Scenario: Provider or acquisition authority is supplied
- **WHEN** a manifest includes auth, scopes, hosts, credentials, registry
  overrides, shell commands, or another unknown field
- **THEN** the entire candidate is rejected before persistence

#### Scenario: Duplicate stable Extension id is supplied
- **WHEN** two snapshot entries contain the same stable Extension id
- **THEN** the complete Catalog candidate is rejected before persistence

### Requirement: Contained inline paths and deterministic bounds
Literal module paths, local package targets, and dependency-resolution artifact paths MUST be normalized
repository-relative POSIX paths no longer than 1024 UTF-8 bytes. Empty paths,
NUL bytes, absolute paths, backslashes, dot or parent segments, non-normalized
forms, and paths or links escaping the exact Catalog snapshot MUST be rejected.
They MUST identify committed regular files or contained package directories as
applicable. Resolution artifact size/content bounds and format validation MUST
delegate to the generic installer; Catalog refresh SHALL only verify the
contained regular file and recorded digest without interpreting it. npm and Git target syntax and credential rejection MUST delegate to
the generic installer target contract rather than a Catalog-specific parser.

#### Scenario: Local package escapes the Catalog snapshot
- **WHEN** a local package descriptor is absolute, traversing, or resolves
  through a link outside the pinned Catalog snapshot
- **THEN** generation or install fails before import, publication, or activation

#### Scenario: Literal module traverses outside the snapshot
- **WHEN** a literal module or resolution artifact path traverses or resolves
  through a link outside the pinned Catalog snapshot
- **THEN** the candidate is rejected before persistence or activation

### Requirement: Hardened Git execution and repository policy
System Git acquisition for the Catalog repository MUST disable terminal
prompting, credential helpers, hooks, submodule recursion, LFS or smudge filters,
and external protocol helpers. Remote Catalog repositories MUST use HTTPS
without URL userinfo, query, or fragment and reject localhost plus literal
loopback, private, link-local, unspecified, or multicast destinations. Local
Catalog repositories MUST be absolute paths.

Catalog repository acquisition MUST remain distinct from Extension package
materialization. Refresh, list, show, search, and startup MUST NOT invoke the
generic package materializer. Catalog code MUST NOT implement registry access,
package-manager execution, dependency resolution, downloads, archive extraction,
immutable package storage, lifecycle locking, or garbage collection.

#### Scenario: Refresh encounters package entries
- **WHEN** a refreshed data-only snapshot contains npm, Git, or local package
  entries
- **THEN** refresh validates and stores their inert exact metadata without
  acquiring, importing, or materializing them

#### Scenario: Unsafe remote Catalog repository is supplied
- **WHEN** a repository URL uses credentials, query/fragment, a non-HTTPS scheme,
  localhost, or a forbidden literal address
- **THEN** validation fails before Git or the generic package materializer runs

#### Scenario: Catalog Git would use ambient credentials
- **WHEN** Git would otherwise prompt or invoke a configured credential helper
- **THEN** Catalog acquisition fails without prompting or invoking the helper

### Requirement: Independent pin refresh and installed provenance
Refresh MUST validate a complete data-only candidate before atomically advancing
only the configured Catalog commit and acquisition time. It MUST NOT change
generic executable installation state or installed Catalog curation links.

A successful Catalog install MUST persist curation separately from execution.
Catalog curation provenance MUST retain Catalog local name/id, repository, exact
commit, snapshot acquisition time, exact entry source locator, Extension id, and
the linked generic execution pin. It MUST NOT duplicate managed paths,
package-manager authentication, or mutable execution state. Reinstall MUST
stage the validated execution record and curation link as distinct members of
one inactive activation generation, durably persist that complete generation,
atomically replace the stable Extension id's single active-generation pointer,
and durably commit the replacement by fsyncing the pointer directory before any
prior-generation cleanup. An identical complete generation is idempotent;
failure before the durable pointer commit preserves both complete recovery
choices, and failure after it can leave only inactive retryable cleanup state.

Catalog install MUST require separate exact-install execution trust, reproduce
the snapshot's exact generic dependency-resolution artifact and source pin,
select the stable Extension id through the common validator, and replace no
active-generation pointer until generic installation and complete validation
succeed.

#### Scenario: Catalog refresh advances after install
- **WHEN** refresh pins a newer commit or a snapshot with a different package
  resolution
- **THEN** configured discovery advances while installed curation and executable
  materialization remain fixed until another explicit trusted install succeeds

#### Scenario: Replacement candidate is invalid
- **WHEN** exact dependency replay, digest verification, root selection, or
  complete-registry validation fails
- **THEN** prior execution and curation provenance remain active unchanged

#### Scenario: Activation is interrupted
- **WHEN** replacement is interrupted before or after the active-generation
  pointer is atomically replaced
- **THEN** recovery exposes either the complete prior pair or the complete new
  pair, never an execution record and curation link from different generations

### Requirement: Safe removal, uninstall, and retained state
Catalog removal MUST fail while any curation link references that configured
Catalog. Uninstalling a Catalog-curated Extension MUST remove its curation link
and the corresponding generic activation record through the common guarded
uninstall lifecycle. Removal and uninstall MUST preserve Sources, Resources,
Artifacts, Accounts, Grants, OAuth Apps, sync history, Catalog snapshots, and any
materialization still referenced by an installation record.

#### Scenario: Referenced Catalog removal is attempted
- **WHEN** installed curation still names the requested Catalog
- **THEN** removal fails atomically and preserves Catalog, execution, curation,
  Source, and Resource state

#### Scenario: Catalog-curated Extension is uninstalled
- **WHEN** origin-neutral stable-id uninstall removes a Catalog-curated Extension
- **THEN** it removes execution activation and its curation link while preserving
  Sources, Resources, snapshots, and other referenced materializations

### Requirement: Strict portable persistence
Configured Catalog records and Catalog curation links MUST use strict versioned
portable persistence that rejects unknown or invalid fields. Snapshot paths and generic materialization paths MUST be
derived under the configured data root rather than persisted as absolute paths.
Records MUST preserve snapshot acquisition time so list, show, search, install,
and loaded provenance can surface age without repository or package access.

#### Scenario: State is relocated
- **WHEN** the ctxindex data root changes while records, snapshots, and managed
  materializations move together
- **THEN** both Catalog and generic execution paths derive from the new root
  without rewriting absolute paths or contacting an upstream source
