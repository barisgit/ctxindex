## MODIFIED Requirements

### Requirement: Explicit trusted direct package acquisition
The system SHALL accept direct Extension package targets classified explicitly
as `npm`, `git`, or `local`. npm targets MUST satisfy the pinned package manager's
npm package-spec grammar, Git targets MUST satisfy its Git package-spec grammar,
and local targets MUST identify package directories. A relative local target
MUST be resolved against the install command's working directory and its
normalized absolute origin MUST be retained for working-directory-independent
updates. Embedded target credentials MUST be rejected and package-manager
authentication material MUST NOT be persisted.

Acquisition MUST occur only during an explicit direct install/update, explicit
Catalog build authoring operation, or trusted Catalog install. Direct
install/update and Catalog build invocations SHALL be their respective
non-interactive operator/author trust grants for package evaluation and import;
each MUST emit the trust notice before package-manager, materialization, or
module-import effects without requiring a redundant flag. Catalog install MUST
instead require its separate `--trust` acknowledgement before refresh or any
executable effect. No startup, list, show, search, refresh, configuration file,
or other read path may create a trust grant.

Direct install/update MUST NOT require or create a Catalog. Every executable
caller MUST describe definition validation as a correctness boundary rather than
a sandbox.

All three callers MUST use the same typed target validation, credential
sanitization, package-manager materialization, immutable publication, exact
Extension selection, complete-registry validation, and rollback behavior.
Catalog build MUST receive only safe exact resolved provenance and a sanitized
replayable dependency-resolution artifact and MUST NOT publish end-user
installation state. ctxindex MUST NOT resolve an Extension dependency graph,
honor an Extension dependency declaration, automatically install sibling roots,
or weaken the package manager's lifecycle-script/trusted-dependency policy.

#### Scenario: npm package is explicitly trusted
- **WHEN** an operator directly installs an npm target and selects one exact
  Extension id
- **THEN** the package manager resolves ordinary dependencies, the command is the
  in-process trust grant, and no Catalog record is required

#### Scenario: Acquisition is attempted without an explicit lifecycle request
- **WHEN** startup or a read-only command encounters an unmaterialized target
- **THEN** the system performs no acquisition or import and reports the Extension
  unavailable

#### Scenario: Package exports sibling Extensions
- **WHEN** the selected package exports multiple Extension roots
- **THEN** only the exact requested Extension root is installed and no Extension
  dependency edge is inferred

#### Scenario: Relative local origin survives working-directory changes
- **WHEN** a direct local package installed by relative target is updated from a
  different working directory
- **THEN** update rereads the normalized stored origin rather than reinterpreting
  the relative argument

#### Scenario: Catalog build evaluates package entries
- **WHEN** an author runs Catalog build over npm, Git, or local package entries
- **THEN** the CLI emits the authoring trust notice before generic materialization
  or import and persists no end-user execution record

#### Scenario: Catalog install omits execution trust
- **WHEN** Catalog install omits its required acknowledgement
- **THEN** the request exits as invalid usage before refresh, package-manager,
  filesystem acquisition, import, materialization, or persisted mutation

## ADDED Requirements

### Requirement: Catalog snapshots reproduce immutable package resolution
The generic installer MUST accept only a Catalog snapshot's source-specific exact
provenance, verified contained dependency-resolution artifact, stable Extension
id, immutable snapshot handle when required for a contained local path, and
optional separately typed exact Catalog curation provenance. That curation input
MUST NOT contain a caller-selected execution pin; the installer MUST derive and
link its validated execution result. npm provenance MUST carry exact `version`
and `integrity`; Git provenance MUST carry exact `commit`; local provenance MUST
carry normalized contained `path` and `contentDigest`. All variants MUST carry
the materialization digest and exact dependency-resolution artifact.

The installer MUST internally acquire into staging, replay the artifact's
ordinary transitive package dependency graph without range drift, resolve
`package.json#ctxindex.extensions`, collect roots, select the exact Extension id,
read the active registry and local OAuth App identities, build and validate the
complete candidate registry, and publish. A Catalog caller MUST NOT supply a
`CompleteRegistryInput`, preselected root, or precomputed active candidate for a
package install. The installer MUST NOT re-resolve a mutable range/ref to a
different result or permit Catalog composition to bypass complete validation.

The generic execution record MUST remain origin-neutral. Catalog local name/id,
repository, commit, snapshot age, and entry locator MUST live in a separate
curation link and MUST NOT alter materialization identity or activation behavior.

#### Scenario: Upstream mutable target has advanced
- **WHEN** Catalog install reproduces an older exact snapshot resolution after
  the authored npm range or Git ref would now choose different code
- **THEN** the generic installer uses the snapshot's exact pin or fails without
  silently selecting the newer target

#### Scenario: Exact reproduction differs
- **WHEN** integrity, content, materialization digest, collected root, or stable
  Extension id differs from the snapshot constraint
- **THEN** installation fails atomically and preserves prior generic execution
  and Catalog curation records

#### Scenario: Transitive dependency range has advanced
- **WHEN** current package metadata would resolve a dependency differently from
  the committed generic resolution artifact
- **THEN** install replays the artifact's exact dependency pin or fails without
  constructing a different materialization

#### Scenario: Catalog delegates an exact package constraint
- **WHEN** Catalog install passes exact snapshot provenance, its verified
  resolution artifact, stable Extension id, and any required immutable snapshot
  handle to the generic installer
- **THEN** the installer itself collects and selects roots, reads active state,
  complete-validates the candidate, and publishes without accepting a caller-
  constructed registry candidate

### Requirement: Catalog entries use common exact selection and complete validation
Literal and package-backed Catalog entries MUST use the same versionless exact
Extension selector and complete candidate-registry validator as direct, built-in,
and explicit-path roots. A literal entry MUST be recollected from the exact
Catalog commit, Catalog id, module, and nested entry index after trust; a package
entry MUST be recollected from its reproduced immutable materialization. Neither
origin may pre-register leaves, shadow by source priority, or win by load order.

#### Scenario: Literal nested identity changed
- **WHEN** the pinned module's selected Catalog entry index no longer contains
  the snapshot's stable Extension id
- **THEN** installation fails before activation or curation publication

### Requirement: Atomic Catalog-curated replacement
Catalog install MUST serialize through the generic lifecycle lock. The generic
installer MUST write the validated execution record and separate Catalog
curation link as distinct members of one inactive activation generation and
fsync the complete generation and its parent directory. It MUST then write and
fsync a pointer candidate, atomically replace the stable Extension id's active-
generation pointer, and fsync the pointer directory. Only the pointer-directory
fsync SHALL make activation durably committed and permit prior-generation
cleanup. Startup MUST read only pointer-reachable generations.

Recovery under the same lock MUST retain the prior pointer when a candidate is
malformed, validate the pointer target before use, and discard or reuse only
inactive unreferenced generations. Cleanup after pointer replacement MUST be
retryable. Any acquisition, import, selection, conflict, digest, record, or
curation failure before the durable pointer commit MUST preserve a complete
recoverable prior generation. Interruption after it MAY leave inert bytes but
MUST expose the complete new pair rather than split active state. Interruption
between pointer rename and pointer-directory fsync MUST leave both complete
generations available; recovery SHALL use whichever complete generation the
durable pointer names.

#### Scenario: Refreshed Catalog candidate is invalid
- **WHEN** reinstall from a newer Catalog commit fails exact reproduction or
  complete-registry validation
- **THEN** the prior installed Extension and prior Catalog curation link remain
  active unchanged

#### Scenario: Interruption occurs before activation commit
- **WHEN** the process stops after staging or fsync but before replacing the
  active-generation pointer
- **THEN** startup and recovery retain the complete prior execution-and-curation
  pair and treat the candidate generation as inactive

#### Scenario: Interruption occurs after activation commit
- **WHEN** the process stops after replacing the active-generation pointer but
  after fsyncing its directory and before superseded-generation cleanup
- **THEN** startup exposes the complete new execution-and-curation pair and
  recovery retries only cleanup of unreferenced state

#### Scenario: Interruption occurs before pointer durability
- **WHEN** the process stops after pointer rename but before pointer-directory
  fsync
- **THEN** both complete generations remain available and recovery exposes the
  complete generation named by the durable pointer without split state

#### Scenario: Active generation is invalid
- **WHEN** startup or recovery encounters a missing, malformed, or mismatched
  pointer-reachable generation
- **THEN** it fails that Extension closed without acquisition, implicit repair,
  or activation of an unreferenced generation
