## ADDED Requirements

### Requirement: Catalog root discovery uses package entry modules
The system SHALL inspect only ESM module paths declared by strict
`package.json#ctxindex.extensions` when explicitly authoring a Catalog. It MUST
inspect exported values generically for versionless Extension and Catalog roots
without persisting JavaScript export names. Unrelated or unknown future root
kinds MUST be ignored. A value claiming a recognized root kind MUST validate
fully; malformed recognized values, duplicate recognized ids, an absent selected
id, or a selected value of the wrong kind MUST fail.

Catalog roots MAY be selected by stable Catalog id for explicit snapshot
generation. They MUST NOT be traversed as package dependencies, automatically
installed, or imported by Catalog refresh/search/list/startup.

#### Scenario: One module exposes Extension and Catalog roots
- **WHEN** one declared entry module exports both root kinds
- **THEN** authoring can select the Catalog id and its stable nested Extension
  entry without persisting either JavaScript export name

#### Scenario: Undeclared file exports a Catalog
- **WHEN** a Catalog exists only in a package file absent from
  `ctxindex.extensions`
- **THEN** ctxindex does not discover or import it

### Requirement: Catalog package installation delegates to source-neutral seams
Core SHALL expose source-neutral seams for package-target resolution,
materialization of the ordinary transitive package dependency graph,
`ctxindex.extensions` root collection, exact versionless Extension selection,
complete candidate validation, and exact-pin reproduction. Explicit-path,
Catalog, and direct package installation MUST delegate to the applicable shared
seams.

Package graph collection MUST mean only the package manager's ordinary
transitive package dependencies. It MUST NOT interpret or traverse a ctxindex
Extension dependency declaration, treat a sibling exported Extension root as a
dependency, or automatically install either. Catalog code MAY provide safe
curation provenance and one exact snapshot pin but MUST NOT implement a package-
source-specific loader, maintain an Extension dependency graph, or bypass
generic installation records and common activation.

#### Scenario: Catalog package entry is installed
- **WHEN** a trusted Catalog snapshot supplies npm, Git, or contained-local exact
  provenance plus one stable Extension id
- **THEN** Catalog delegates exact reproduction, package dependency
  materialization, root collection, selection, and validation to the generic
  installer and stores curation separately

#### Scenario: Package exposes sibling roots or Extension dependency text
- **WHEN** the selected package exports sibling Extension roots or code contains
  a ctxindex Extension dependency declaration
- **THEN** only the exact selected root is installed and neither construct is
  traversed as an installable dependency

## MODIFIED Requirements

### Requirement: Installed Catalog Extension loading and provenance
After a trusted Catalog install, startup SHALL load the Extension only from the
generic persisted execution record and immutable managed materialization through
the common package-entry, root-collection, exact-selection, complete-registry,
and atomic-activation path. Startup and loaded-Extension listing MUST NOT refresh
the Catalog, invoke package management, contact npm or Git, read the original
local target, resolve a requested range/ref, import a Catalog author module, or
mutate installation state.

Loaded inventory and diagnostics MUST expose deterministic safe execution
provenance plus separate Catalog curation provenance. Missing or invalid pinned
material MUST degrade that Extension with a provenance-bearing diagnostic,
preserve Source-owned state, and allow unrelated valid roots to load. It MUST
NOT trigger repair or acquisition.

#### Scenario: Catalog-curated Extension starts offline
- **WHEN** one valid active generation contains generic execution state and its
  separate Catalog curation member after relocation
- **THEN** startup derives the managed path and loads the stable Extension id
  without Catalog, package-manager, network, or original-source access

#### Scenario: Active generation is invalid
- **WHEN** the active-generation pointer is missing, malformed, or names a
  generation whose execution and curation members do not validate together
- **THEN** startup reports the inconsistency without acquisition, implicit
  pointer repair, Catalog refresh, or deletion of Source/Resource state

### Requirement: Missing or invalid installed snapshots degrade without fetch
The loader MUST report an Extension-scoped diagnostic when installed Catalog
curation or generic execution provenance refers to a missing, corrupt, invalid,
or mismatched snapshot, materialization, nested literal root, package pin, or
Extension definition. The diagnostic MUST carry safe provenance and the loader
MUST NOT refresh, fetch, repair, relink, or mutate
Catalog/installation state, and MUST preserve Sources, Resources, Artifacts,
snapshots, curation links, and unrelated installed Extensions.

#### Scenario: Generic execution materialization is missing
- **WHEN** a valid active generation refers to an absent generic execution
  materialization
- **THEN** the loader reports the unavailable Extension, performs no repository
  or package access, preserves materialized data, and loads unrelated valid roots
