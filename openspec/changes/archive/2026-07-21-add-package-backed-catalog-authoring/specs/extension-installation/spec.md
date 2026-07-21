## MODIFIED Requirements

### Requirement: Explicit trusted direct package acquisition

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
installed state. `installExact`
SHALL accept only exact replay metadata and SHALL reproduce, verify, completely
validate, publish, and record that candidate.

Direct install/update SHALL reuse the same internal phases and trust boundary.
No list, show, search, refresh, or startup path SHALL implicitly acquire a
package.

#### Scenario: npm package is explicitly trusted

- **WHEN** a user explicitly requests and trusts direct npm installation with an
  exact Extension selection
- **THEN** the canonical installer materializes, selects, validates, publishes,
  and records it through the shared lifecycle

#### Scenario: Catalog build evaluates package entries

- **WHEN** a trusted Catalog build resolves a package target
- **THEN** it calls `resolveForAuthoring` and receives exact replay metadata
  without installing the Extension

#### Scenario: Acquisition is attempted without an explicit lifecycle request

- **WHEN** a read-only Catalog, Marketplace, or startup path encounters package
  replay metadata
- **THEN** no package manager, import, materialization, or publication occurs

### Requirement: Exact package selection and complete validation

Every authoring resolution and installation SHALL discover only declared entry
modules and SHALL select exactly one Extension matching the requested stable id.
Sibling roots SHALL NOT cause implicit selection.

Authoring resolution SHALL validate the selected root and reachable roots as an
intrinsic package registry independent of the author's active machine state.
Exact installation SHALL repeat intrinsic validation and SHALL validate the
candidate in the complete active registry, including builtin, explicit-path,
generic installed, provider, and OAuth-app contracts, before commit.
The canonical installer SHALL read that active state itself; a Catalog caller
SHALL NOT construct or supply an alternate registry context.

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

## ADDED Requirements

### Requirement: Catalog snapshots reproduce immutable package resolution

`resolveForAuthoring` SHALL record exact source provenance, normalized package
root, expected canonical materialization digest, and a bounded
content-addressed sanitized lock artifact with format `bun.lock@1.3.14`.

For npm, exact provenance SHALL contain package name, exact version, and
integrity. For Git, it SHALL contain credential-free repository identity and
exact commit. For local sources, it SHALL contain a normalized path within the
immutable snapshot and content digest.
Every source SHALL retain a sanitized `requestedTarget` for explanation only;
the lock and exact fields SHALL remain replay authority. Literal author-package
local provenance SHALL identify the immutable Catalog snapshot root without
persisting an author-machine absolute path.

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
tokens, authentication headers, secret query data, absolute host paths, home
paths, traversal, symlink escapes, mutable Git refs, unsupported protocols,
external file dependencies, lifecycle scripts, and lock formats not replayable
by Bun 1.3.14. SSH Git resolutions MAY contain only the exact `git` username and
no password; every other URL userinfo form SHALL be rejected.

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
extensionId }` selection and
SHALL replay the author package under its sanitized lock, verify the expected
materialization digest and package root, import the exact declared module,
select the exact Catalog id and zero-based entry index, and verify the stable
Extension id.

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
containing exact source, materialization digest, package root, numeric
timestamps, and
optional Catalog curation. Catalog curation SHALL include configured Catalog
name, Catalog id, repository, selected commit, snapshot acquisition time, and
exact source locator in that same record.

After staging and validation, the installer SHALL take the lifecycle lock,
recheck collisions, publish immutable managed bytes, and atomically rewrite the
entire strict generic record document by synced temporary file, rename, and
parent-directory sync. Failure before durable rename SHALL leave the prior
record authoritative. Published but unreferenced bytes SHALL remain inert and
SHALL be cleaned idempotently.

Before the record-document rename, the installer SHALL durably sync every
regular file in the published materialization and every directory required to
reach it within the managed data root. An existing same-digest materialization
SHALL be revalidated and re-synced before it can become newly authoritative.
Any supported-platform durability failure SHALL abort before record replacement.
If the record rename succeeds but its parent-directory sync fails, the operation
SHALL report a durability failure and retain every materialization referenced by
either the prior or renamed document so either crash-visible outcome is valid.
If the platform reports directory sync as unsupported, the operation MAY
succeed but SHALL likewise retain both outcomes instead of collecting the prior
materialization.

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

#### Scenario: Published materialization sync fails

- **WHEN** managed bytes were renamed into their immutable digest path but file
  or supported directory durability fails before the record-document rename
- **THEN** the previous record remains authoritative and the new bytes remain
  inert until idempotent cleanup

#### Scenario: Record parent-directory sync fails after rename

- **WHEN** the record document was atomically renamed but syncing its parent
  directory fails
- **THEN** the operation reports a durability failure and retains the immutable
  bytes for both the prior and renamed record outcomes

#### Scenario: Record parent-directory sync is unsupported

- **WHEN** the host exposes no supported operation for syncing the record parent
  directory after rename
- **THEN** ctxindex does not collect the prior materialization, so either
  crash-visible record remains loadable

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
