# Direct Extension Installation Specification

## Purpose
Define explicit trusted acquisition, immutable provenance, offline loading, and lifecycle behavior for directly installed Extension packages.

## Requirements

### Requirement: Explicit trusted direct package acquisition
The system SHALL accept direct Extension package targets classified explicitly as `npm`, `git`, or `local`. npm targets MUST satisfy the pinned package manager's npm package-spec grammar, Git targets MUST satisfy its Git package-spec grammar, and local targets MUST identify package directories. A relative local target MUST be resolved against the install command's working directory and its normalized absolute origin MUST be retained for working-directory-independent updates. Direct acquisition MUST occur only during an explicit install or update request, MUST use the pinned package manager to resolve ordinary package dependencies, and MUST NOT require or create a Catalog. The explicit install or update request SHALL be the trust grant for importing and executing arbitrary package code in-process; validation MUST be described as a correctness check rather than a sandbox. Embedded target credentials MUST be rejected and package-manager authentication material MUST NOT be persisted in installation state.

ctxindex MUST NOT resolve an Extension dependency graph, honor an Extension dependency declaration, or automatically install sibling Extension roots. It MUST NOT weaken the package manager's lifecycle-script or trusted-dependency policy.

The canonical generic installer SHALL remain the only implementation for direct
and Catalog-backed package acquisition, selection, validation, managed
publication, lifecycle locking, record persistence, and cleanup.

It SHALL expose separate `resolveForAuthoring` and `installExact` operations.
`resolveForAuthoring` SHALL require an explicit target and selection union:
`{ kind: "extension", extensionId }` for a package descriptor or
`{ kind: "catalog", module, catalogId? }` for an author package, where an omitted
id requires exactly one Catalog root in the declared module. It SHALL resolve
one exact requested root in isolated staging, perform intrinsic package
validation, and return that root plus replay metadata without publishing
installed state. `installExact` SHALL accept only exact replay metadata and SHALL
reproduce, verify, completely validate, publish, and record that candidate.

Direct install/update SHALL reuse the same internal phases and trust boundary.
No list, show, search, refresh, or startup path SHALL implicitly acquire a
package.

#### Scenario: npm package is explicitly trusted
- **WHEN** an operator installs an npm target and selects one exact Extension id
- **THEN** the package manager resolves the package and its ordinary dependencies, ctxindex treats that command as the in-process execution trust grant, and no Catalog record is required

#### Scenario: Acquisition is attempted without an explicit lifecycle request
- **WHEN** a read-only Catalog, Marketplace, or startup path encounters package
  replay metadata
- **THEN** no package manager, import, materialization, or publication occurs

#### Scenario: Package exports sibling Extensions
- **WHEN** the selected package exports multiple Extension roots
- **THEN** only the exact requested Extension root is installed and no Extension dependency edge is inferred

#### Scenario: Relative local origin survives working-directory changes
- **WHEN** a local package is installed through a relative target and later updated from another working directory
- **THEN** update rereads the normalized origin selected at install rather than reinterpreting the relative argument

#### Scenario: Catalog build evaluates package entries

- **WHEN** a trusted Catalog build resolves a package target
- **THEN** it calls `resolveForAuthoring` and receives exact replay metadata
  without installing the Extension

### Requirement: Immutable resolved materialization and generic provenance
Every successful direct install or update MUST publish a complete immutable runnable materialization in ctxindex-managed storage. An npm target MUST resolve to an exact version plus available package integrity, a Git target MUST resolve to an exact commit, and a local target MUST resolve to a content digest snapshot. All target kinds MUST retain a materialization/dependency resolution digest sufficient to identify the exact runnable candidate.

The persisted record MUST contain the stable Extension id, source kind, sanitized requested target, exact resolved identity, integrity or content digest, materialization digest, and installation/update time. It MUST NOT persist credentials, package-manager authentication state, or Catalog-shaped provenance. Managed absolute paths MUST be derived rather than persisted.

#### Scenario: Mutable target resolves once
- **WHEN** install resolves an npm range, Git ref, or mutable local package
- **THEN** the resulting record points to an immutable exact materialization and later startup does not observe upstream changes

#### Scenario: Provenance is inventoried safely
- **WHEN** direct installation inventory is rendered as text or JSON
- **THEN** it identifies requested and resolved provenance deterministically without credentials or authentication state

### Requirement: Exact package selection and complete validation
Every authoring resolution and installation SHALL discover only declared entry
modules and SHALL select exactly one Extension matching the requested stable id.
Sibling roots SHALL NOT cause implicit selection.

Authoring resolution SHALL validate the selected root and reachable roots as an
intrinsic package registry independent of the author's active machine state.
Exact installation SHALL repeat intrinsic validation and SHALL validate the
candidate in the complete active registry, including builtin, explicit-path,
generic installed, provider, and OAuth-app contracts, before commit. The
canonical installer SHALL read that active state itself; a Catalog caller SHALL
NOT construct or supply an alternate registry context.

No installation origin MAY bypass the common `ctxindex.extensions`
manifest-entry resolver, namespace root collector, transitive reachable-leaf
collector, conservative conflict policy, or complete candidate-registry
validator, pre-register leaves, shadow another origin, or win by source priority
or install order. Import and validation SHALL occur from staging before
persistent installation state changes.

#### Scenario: Exact root is absent or ambiguous
- **WHEN** the requested Extension id selects zero or more than one collected root
- **THEN** install fails before publishing installation state

#### Scenario: Candidate conflicts with an active origin
- **WHEN** the selected root conflicts with a built-in, explicit-path, Catalog, or other direct root
- **THEN** complete candidate validation rejects atomically without choosing an origin winner

#### Scenario: Package exports sibling Extensions

- **WHEN** a package exports several roots and one stable Extension id is
  requested
- **THEN** only the exact requested Extension is selected and siblings do not
  become installed implicitly

#### Scenario: Complete registry rejects the candidate

- **WHEN** exact replay succeeds but the candidate conflicts with active registry
  contracts
- **THEN** installation fails before record replacement and the prior installed
  state remains authoritative

### Requirement: Catalog snapshots reproduce immutable package resolution

`resolveForAuthoring` SHALL record exact source provenance, normalized package
root, expected canonical materialization digest, and a bounded
content-addressed sanitized lock artifact with format `bun.lock@1.3.14`.

For npm, exact provenance SHALL contain package name, exact version, and
integrity. For Git, it SHALL contain credential-free repository identity and
exact commit. For local sources, it SHALL contain a normalized path within the
immutable snapshot and content digest. Every source SHALL retain a sanitized
`requestedTarget` for explanation only; the lock and exact fields SHALL remain
replay authority. Literal author-package local provenance SHALL identify the
immutable Catalog snapshot root without persisting an author-machine absolute
path.

`installExact` SHALL create a sanitized staging manifest from that provenance,
write the exact lock bytes, and run pinned Bun 1.3.14 with frozen-lockfile,
production, and ignore-scripts semantics. It SHALL NOT re-resolve the original
range, tag, branch, or other mutable request. Source, lock, package-root, selected
identity, and materialization-digest mismatch SHALL fail before commit.

#### Scenario: Upstream mutable target has advanced

- **WHEN** the original npm range, tag, or Git branch now resolves differently
  from the snapshot
- **THEN** Catalog install reproduces the recorded exact source and frozen lock
  or fails without using the newer result

#### Scenario: Transitive dependency range has advanced

- **WHEN** a transitive range could resolve to newer bytes after build
- **THEN** frozen lock replay uses the recorded graph and verifies the expected
  materialization digest

#### Scenario: Exact reproduction differs

- **WHEN** replayed source integrity, commit, local content, package root,
  selected identity, or materialization digest differs
- **THEN** installation fails and publishes no authoritative record

### Requirement: Sanitized replay artifacts contain no ambient authority

The canonical installer SHALL sanitize and validate replay lock artifacts before
snapshot publication and again before replay. It SHALL reject credentials,
tokens, userinfo, authentication headers, secret query data, absolute host paths,
home paths, traversal, symlink escapes, mutable Git refs, unsupported protocols,
external file dependencies, lifecycle scripts, and lock formats not replayable
by Bun 1.3.14.

Package subprocesses SHALL be non-interactive and SHALL NOT use ambient
credential helpers or authentication configuration.

#### Scenario: Lock contains a credential-bearing URL

- **WHEN** resolution produces a lock entry containing embedded credentials or
  secret query data
- **THEN** authoring fails before snapshot publication

#### Scenario: Replay artifact uses an absolute local path

- **WHEN** a lock contains an absolute or escaping file dependency
- **THEN** authoring or installation rejects it without invoking that dependency

### Requirement: Literal Catalog entries replay immutable author packages

A literal Catalog entry SHALL be installed from the exact author-package replay
payload and locator stored in the immutable Catalog snapshot. `installExact`
SHALL receive a `{ kind: "catalog-entry", module, catalogId, entryIndex,
extensionId }` selection and SHALL replay the author package under its sanitized
lock, verify the expected materialization digest and package root, import the
exact declared module, select the exact Catalog id and zero-based entry index,
and verify the stable Extension id.

After complete validation, the installer SHALL publish the replayed author
package as managed runnable bytes. It SHALL NOT persist only an in-memory
Extension root and SHALL NOT require the Catalog snapshot or author checkout at
startup.

#### Scenario: Literal nested identity changed

- **WHEN** replayed module, Catalog id, entry index, or Extension id differs from
  the recorded locator
- **THEN** installation fails before managed publication or record commit

#### Scenario: Literal Extension starts offline

- **WHEN** a literal Catalog Extension was installed successfully and upstream,
  the Catalog checkout, Bun, and the network are unavailable
- **THEN** startup imports it from the managed author-package materialization

### Requirement: One atomic generic installation record

Each managed stable id SHALL have exactly one generic installed-extension record
containing exact source, materialization digest, package root, numeric timestamps,
and optional Catalog curation. Catalog curation SHALL include configured Catalog
name, Catalog id, repository, selected commit, snapshot acquisition time, and
exact source locator in that same record.

After staging and validation, the installer SHALL take the lifecycle lock,
recheck collisions, publish immutable managed bytes, and atomically rewrite the
entire strict generic record document by synced temporary file, rename, and
parent-directory sync. Failure before durable rename SHALL leave the prior
record authoritative. Published but unreferenced bytes SHALL remain inert and
SHALL be cleaned idempotently.

The implementation SHALL NOT create activation generations, pointer files,
rollback history, or a separate Catalog curation/execution store.

#### Scenario: Interruption occurs before record rename

- **WHEN** install or replacement is interrupted after staging or publication but
  before the atomic record rename is durable
- **THEN** the previous generic record remains authoritative and any new bytes
  are inert

#### Scenario: Record rename is durable

- **WHEN** the complete replacement document is durably renamed
- **THEN** startup observes the new execution and optional curation together
  without consulting a pointer or history

### Requirement: Catalog replacement is limited to the same Catalog

A Catalog install SHALL create an absent stable id or replace a record only when
the existing record's configured Catalog name and Catalog id both match the
selected Catalog. Exact replay of the same record SHALL be idempotent.

A direct record, record curated by another Catalog, builtin Extension, or
explicit-path Extension using the stable id SHALL cause a conflict with
uninstall-first guidance. Direct install/update SHALL NOT replace a curated
record implicitly. Collision failure SHALL preserve all prior bytes and records.

#### Scenario: Same Catalog advances its curated entry

- **WHEN** the same configured Catalog name and Catalog id select a newer exact
  commit and replay and validation succeed
- **THEN** its generic record is atomically replaced

#### Scenario: Different origin owns the stable id

- **WHEN** the stable id belongs to direct install, another Catalog, a builtin,
  or an explicit path
- **THEN** Catalog install fails with uninstall-first guidance

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
