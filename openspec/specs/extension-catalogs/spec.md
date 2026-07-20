# Extension Catalogs Specification

## Purpose
Define trusted Git Catalog acquisition, bounded inert manifests, immutable snapshots, independent execution trust, and safe installed-Extension provenance.

## Requirements

### Requirement: Explicit trusted Catalog acquisition
The system SHALL register multiple Catalogs from credential-free public HTTPS repositories or absolute local Git repositories only after explicit repository trust. Add and command-time refresh SHALL resolve a full branch ref, full tag ref, or exact object ID exactly once to an exact commit and SHALL be the only operations allowed to contact a remote repository. Local acquisition MUST read committed Git objects rather than working-tree bytes.

#### Scenario: Full ref resolves to immutable snapshot
- **WHEN** a user adds a valid Catalog with `--trust` and a full ref
- **THEN** the system records the resolved exact commit and publishes an immutable snapshot derived from that commit

#### Scenario: Trust is missing
- **WHEN** a user attempts Catalog add without repository trust acknowledgement
- **THEN** the request fails as usage error with exit code 2 before repository access

#### Scenario: Discovery and install refresh by default
- **WHEN** a user lists configured Catalogs, shows a Catalog or exact entry, or installs an Extension without `--no-refresh`
- **THEN** the involved Catalog is refreshed before the command reads or installs from its newly pinned snapshot

#### Scenario: Explicit stored-snapshot use remains offline
- **WHEN** a user passes `--no-refresh` to Catalog list/show or Extension install
- **THEN** the command uses only persisted records and snapshots, performs no repository access, and surfaces the age of the stored snapshot

#### Scenario: Refresh failure is observable
- **WHEN** default command-time refresh fails
- **THEN** the command fails without silently falling back to stale Catalog discovery or changing installed provenance

#### Scenario: Startup remains offline
- **WHEN** ctxindex starts, loads Extensions, lists loaded Extensions, uninstalls, or removes a Catalog
- **THEN** it uses only persisted records and snapshots and performs no repository access

### Requirement: Typed direct Catalog authoring

The SDK SHALL expose effect-free plain factories with the established shape
`defineCatalog({ id, label, summary?, entrySummaries?, extensions })` and
`packageExtension(source, extensionId)`. A package descriptor SHALL have exactly
`{ kind: "package-extension", source, extensionId }`, where `source` is the
exported `{ kind, target }` npm, Git, or local `ExtensionPackageTarget` union.
`extensions` SHALL accept literal Extension roots and those descriptors.
`entrySummaries`, when present, SHALL be a plain partial map whose keys are
limited by inference and runtime validation to the stable ids in `extensions`.
It SHALL provide the optional per-entry Marketplace summary for literal and
package-backed entries without changing either underlying entry value.
Factories SHALL preserve inference, exact public shapes, excess-property
checking, structural copy compatibility, and SDK dependency boundaries.

Catalog entries SHALL be versionless and SHALL accept only literal Extension
objects or package descriptors. A Catalog or any other value SHALL NOT be valid
as an entry.

#### Scenario: Mixed Catalog is authored

- **WHEN** an author defines one Catalog containing literal, npm, Git, and local
  package entries
- **THEN** the SDK returns a plain typed value without filesystem, package
  manager, import, trust, or persistence effects, and build emits any authored
  per-entry summaries into the corresponding schema-v2 entries

#### Scenario: Unsupported Catalog entry is supplied

- **WHEN** an author places a Catalog or any other unsupported value in
  `extensions`
- **THEN** type checking and runtime snapshot validation reject it

### Requirement: Trusted deterministic Catalog build

Catalog build SHALL require explicit author trust before package acquisition,
Bun execution, or module import. It SHALL resolve the author package and every
package entry through the canonical installer's `resolveForAuthoring` operation.

The build SHALL emit one deterministic schema-v2 snapshot only after every entry
is resolved, selected, and intrinsically validated. It SHALL sort canonical
content, normalize paths, deduplicate identical lock artifacts by digest, and
atomically replace output. Any candidate failure SHALL leave prior output
unchanged.

#### Scenario: Package target resolves during build

- **WHEN** a trusted build includes a mutable npm range or Git ref
- **THEN** the snapshot records its exact version and integrity or exact commit,
  expected materialization digest, package root, and sanitized Bun 1.3.14 lock
  artifact

#### Scenario: Candidate generation fails

- **WHEN** any declared module, selected Extension, exact resolution, lock
  sanitization, or intrinsic validation fails
- **THEN** build fails without publishing a partial snapshot

### Requirement: Literal entries carry exact author-package replay locators

A literal entry SHALL record the exact immutable author-package replay payload
and a locator containing normalized module path, Catalog id, zero-based entry
index, and Extension id. The author-package replay payload SHALL include exact
source provenance, package root, expected materialization digest, and sanitized
Bun 1.3.14 lock artifact.

The locator SHALL be verified against the exact author-package materialization
during build and install. The snapshot SHALL NOT serialize an in-memory
Extension root as a substitute for runnable package bytes.

#### Scenario: Module exports multiple Catalog roots

- **WHEN** a declared module exports multiple Catalogs or a Catalog contains
  multiple literal entries
- **THEN** each literal snapshot entry records the exact Catalog id and entry
  index that identifies its Extension id

#### Scenario: Literal identity no longer matches

- **WHEN** exact replay yields a different Catalog id, entry index, or Extension
  id than the locator
- **THEN** installation fails before managed bytes or records are committed

### Requirement: Deterministic aggregate Marketplace search

Marketplace search SHALL project only stored validated snapshot data. Matching
SHALL be case-insensitive over Extension id and summary. Results SHALL retain all
matching curation rows, including duplicate stable ids across Catalogs, and sort
deterministically by normalized Extension id, configured Catalog name, Catalog
id, and source locator.

Default search SHALL refresh configured Catalogs before projection. Stored search
or `--no-refresh` SHALL perform no network access and SHALL report snapshot age.
Search SHALL NOT invoke Bun, import modules, or materialize packages.

#### Scenario: Duplicate curation is searched

- **WHEN** two configured Catalogs contain the same stable Extension id and both
  match the query
- **THEN** both deterministic curation rows are returned

#### Scenario: Stored Marketplace search is requested

- **WHEN** search is requested without refresh
- **THEN** only stored snapshot data is used and each result reports its stored
  snapshot age

### Requirement: Strict bounded Catalog manifest

Each snapshot SHALL contain a UTF-8 `ctxindex-catalog.json` at repository root
of at most 256 KiB. A stored Catalog manifest SHALL use the closed schema-v2
shape, contain at most 256 Extension entries, and SHALL contain
only versionless metadata, exact replay provenance, literal locators, and bounded
references to contained content-addressed lock artifacts. Unknown fields,
duplicate stable ids within one Catalog, malformed exact pins, unsupported lock
formats, unsafe paths, invalid digests, or exceeded per-artifact/aggregate bounds
SHALL fail validation before state mutation.

Each exact source SHALL retain a sanitized explanatory `requestedTarget`; lock
bytes plus the exact npm version/integrity, Git commit, or contained local
path/content digest SHALL remain replay authority. Literal author-package local
provenance SHALL denote the immutable snapshot root, never an author-machine
absolute checkout path.

The manifest SHALL NOT grant provider authority, acquisition authority, ambient
credential use, lifecycle scripts, nested Catalogs, mutable install-time source
selection, or executable behavior during parsing.

#### Scenario: Unknown provider authority is declared
- **WHEN** a manifest contains an auth, scopes, config, hosts, or other unknown field
- **THEN** the entire Catalog candidate is rejected before persistence

#### Scenario: Versioned Extension entry is supplied

- **WHEN** a manifest supplies a version field or versioned Extension selector
- **THEN** validation rejects the manifest

#### Scenario: Replay artifact is unsafe

- **WHEN** a lock artifact path traverses, escapes containment, exceeds bounds,
  mismatches its digest, or declares a format other than `bun.lock@1.3.14`
- **THEN** validation rejects the snapshot without executing the artifact

#### Scenario: Duplicate stable Extension id is supplied

- **WHEN** one Catalog contains the same stable Extension id more than once
- **THEN** validation rejects the manifest deterministically

### Requirement: Contained inline paths and deterministic bounds
All snapshot paths SHALL be normalized and contained. Module paths, local
package paths, lock artifact paths, and package roots SHALL be relative to the
immutable Catalog snapshot or replayed package root as applicable. Validation
SHALL reject absolute paths, traversal, symlink escape, host-specific build
paths, and values outside declared depth/count/byte limits.

Each persisted relative path SHALL be a normalized POSIX path no longer than
1024 UTF-8 bytes and SHALL reject empty values, NUL bytes, backslashes, dot or
parent segments, and non-normalized forms except where the schema explicitly
permits `.` as a package root.

#### Scenario: Local package escapes the Catalog snapshot

- **WHEN** a local package or file dependency resolves outside the immutable
  snapshot
- **THEN** build or validation rejects it before publication

#### Scenario: Literal module traverses outside the author package

- **WHEN** a literal locator module is absolute, traversing, or escapes through a
  symlink
- **THEN** build or installation rejects it before import

### Requirement: Hardened Git execution and repository policy
Adding a remote Git Catalog SHALL require explicit repository trust and hardened
non-interactive credential-free Git policy. Add and refresh SHALL acquire and
validate only inert snapshot data and contained artifacts at an exact commit;
they SHALL NOT invoke Bun, import modules, or materialize Extension packages.

System Git acquisition MUST disable terminal prompting, credential helpers,
repository and global hooks, submodule recursion, LFS or smudge filters, and
external protocol helpers. Remote repositories MUST use HTTPS without URL
userinfo, query, or fragment components and MUST reject localhost plus literal
loopback, private, link-local, unspecified, or multicast destinations. Local
Catalog repositories MUST be absolute paths. SSH, credentials, and private
Catalog repositories MUST NOT be supported.

Package-manager execution and module import SHALL occur only during explicitly
trusted build or install operations.

#### Scenario: Unsafe remote repository is supplied
- **WHEN** a repository URL uses userinfo, a query or fragment, a non-HTTPS scheme, localhost, or a forbidden literal address
- **THEN** validation fails before Git is invoked

#### Scenario: Repository attempts ambient credential use
- **WHEN** Git would otherwise prompt or invoke a configured credential helper
- **THEN** acquisition fails without prompting or invoking the helper

#### Scenario: Refresh encounters package entries

- **WHEN** refresh validates a schema-v2 snapshot containing package and literal
  replay metadata
- **THEN** it stores bounded data without invoking the canonical installer, Bun,
  or module import

#### Scenario: Catalog Git would use ambient credentials

- **WHEN** repository acquisition would prompt, use a credential helper, or send
  ambient credentials
- **THEN** it fails closed before persisted Catalog state changes

### Requirement: Independent pin refresh and installed provenance
Refreshing a configured Catalog SHALL advance only its selected snapshot commit.
It SHALL NOT mutate installed Extensions. A successful Catalog install SHALL
write optional curation into the same generic execution record, including
configured Catalog name, stable Catalog id, repository, selected commit,
snapshot acquisition time, and exact source locator.

A subsequent install SHALL replace an installed record automatically only when
both configured Catalog name and Catalog id match. Direct records, another
Catalog, builtins, and explicit-path Extensions SHALL require uninstall first.

#### Scenario: Catalog refresh advances after install

- **WHEN** a configured Catalog refreshes to a newer commit after one of its
  Extensions was installed
- **THEN** the installed generic record and managed bytes remain unchanged until
  a trusted install is requested

#### Scenario: Same Catalog installs a newer exact entry

- **WHEN** the selected Catalog name and Catalog id match the installed record
  and exact replay and validation succeed
- **THEN** the generic record and managed materialization are atomically replaced

#### Scenario: Another origin uses the stable id

- **WHEN** a Catalog install collides with a direct record, another Catalog,
  builtin, or explicit-path Extension
- **THEN** it fails with uninstall-first guidance and changes no state

### Requirement: Safe removal, uninstall, and retained state
Removing a configured Catalog SHALL be blocked while any generic installed
record's curation references that configured Catalog. Origin-neutral uninstall
SHALL remove the generic record and its referenced managed bytes under the
canonical lifecycle lock without requiring the Catalog snapshot or network.
It SHALL preserve Sources, Resources, and Catalog snapshots.

No activation generations, pointer files, rollback history, or Catalog-specific
execution records SHALL be retained.

#### Scenario: Referenced Catalog removal is attempted
- **WHEN** any installed record cites the configured Catalog being removed
- **THEN** removal fails and identifies the installed stable ids

#### Scenario: Catalog-curated Extension is uninstalled

- **WHEN** uninstall targets a Catalog-curated stable id
- **THEN** the generic record and managed bytes are removed atomically enough that
  startup cannot load a record without its committed execution ownership

### Requirement: Strict portable persistence
All persisted Catalog and install paths SHALL be portable. Configured Catalog
state, stored snapshots, replay artifact references, generic installed records,
and managed package roots SHALL use normalized state-relative paths. They SHALL
NOT persist author-machine temporary roots, absolute checkout paths, credentials,
generation pointers, or inferred recovery state.

#### Scenario: State is relocated
- **WHEN** the complete ctxindex state tree is moved and the compiled CLI starts
  with no network or package manager access
- **THEN** Catalog inspection and installed Extension loading resolve from the
  relocated stored snapshot metadata and managed bytes
