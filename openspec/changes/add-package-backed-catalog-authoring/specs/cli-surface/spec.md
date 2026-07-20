## ADDED Requirements

### Requirement: Deterministic Catalog authoring command
The CLI SHALL provide
`extensions catalog build <package-root> [--catalog <id>] [--output <path>]`
as an explicit local authoring operation. It MUST inspect only modules declared
by `package.json#ctxindex.extensions`, require `--catalog` when more than one
Catalog id exists, delegate npm/Git/local target resolution and materialization
to the generic installer primitive, validate the complete candidate, and
atomically write canonical snapshot bytes. Output SHALL default to
`<package-root>/ctxindex-catalog.json`.

Catalog build SHALL be an explicit non-interactive author trust grant for
package evaluation and import. It MUST emit the trust notice to stderr before
generic package-manager, materialization, or module-import effects so JSON
stdout remains one valid result document; it MUST NOT require a redundant
`--trust` flag or publish an end-user execution record.

Text and JSON results MUST report the selected Catalog, stable Extension ids,
source kinds, sanitized targets, and exact resolved pins deterministically. They
MUST NOT expose credentials, authentication state, author-machine absolute
paths, managed paths, or JavaScript export names.

#### Scenario: Generated snapshot is current
- **WHEN** generation produces bytes identical to the existing output
- **THEN** the command succeeds without changing the file

#### Scenario: Candidate generation fails
- **WHEN** Catalog selection, package resolution, exact Extension selection,
  definition validation, or canonical snapshot validation fails
- **THEN** the command returns the mapped failure and preserves the prior output

### Requirement: Deterministic aggregate Extension search
The CLI SHALL provide `extensions search [query] [--no-refresh]` as Marketplace
search over every configured Catalog. It MUST delegate refresh, matching,
ordering, and provenance to provider-neutral core. Text and JSON output MUST
retain duplicate curation rows and include Catalog local name/id, stable
Extension id, source kind, source-specific exact npm version/integrity, Git
commit, or contained local path/content digest when applicable, exact Catalog
commit, and stored snapshot age. It MUST NOT expose an implicit preferred Catalog
or install source.

#### Scenario: Marketplace search is requested as JSON
- **WHEN** an agent invokes `extensions search calendar --json`
- **THEN** the CLI emits one deterministic machine-readable array ordered by
  core without importing Catalog/Extension code or materializing a package

#### Scenario: Stored Marketplace search is requested
- **WHEN** an agent invokes `extensions search --no-refresh --json`
- **THEN** the command searches stored snapshots offline and reports snapshot
  age for every result

### Requirement: Marketplace-facing refresh scope
Catalog list, Catalog show, Marketplace search, and Catalog Extension install SHALL
refresh by default. List and search MUST refresh every configured Catalog
in deterministic local-name order; show and install MUST refresh only their
selected Catalog. Each MUST accept `--no-refresh` to use stored snapshot state,
perform no Catalog Git refresh, and expose snapshot age.

A refresh-enabled install MUST execute only the exact entry from the newly
pinned selected Catalog. It MUST NOT refresh unrelated Catalogs or resolve a
snapshot's requested npm range, Git ref, or local target to different code.

#### Scenario: Install refreshes one Catalog
- **WHEN** an operator installs a Catalog Extension without `--no-refresh`
- **THEN** ctxindex refreshes only that Catalog and reproduces the exact resulting
  snapshot pin after execution trust

#### Scenario: Default Marketplace refresh fails
- **WHEN** any involved Catalog fails to refresh before search
- **THEN** CLI returns the mapped acquisition failure and emits no stale success
  payload

### Requirement: Loaded Extension provenance output
Loaded-Extension inventory MUST distinguish generic executable provenance from
optional Catalog curation provenance. Catalog-curated output MUST include stable
Extension id, source kind, source-specific exact npm version/integrity, Git
commit, or contained local path/content digest, materialization digest, Catalog
local name/id/repository/commit, and snapshot age. Literal entries MUST identify
their pinned module and nested entry index. Output MUST NOT include an Extension
definition version, JavaScript export name, credential, package-manager auth, or
absolute managed path.

#### Scenario: Offline loaded listing is requested
- **WHEN** an agent lists loaded Extensions after a Catalog install
- **THEN** CLI renders both provenance layers from persisted state without
  refresh, package-manager, registry, Git, original-local-path, or import effects

## MODIFIED Requirements

### Requirement: Deterministic Git Catalog command surface
Catalog commands SHALL use stable versionless Extension ids. Existing versioned
`<id>@<definition-version>` Catalog selectors MUST be removed with no pre-alpha
compatibility alias. Catalog install MUST retain its explicit `--trust` execution
acknowledgement and remain distinguishable from direct npm/Git/local install.
Catalog list/show and Catalog Extension install MUST refresh the involved
Catalogs by default and accept `--no-refresh` to use stored snapshots. Every text
and JSON result MUST remain deterministic, expose applicable stored snapshot age,
and delegate business behavior to provider-neutral core.

```text
extensions catalog build <package-root> [--catalog <id>] [--output <path>] [--json]
extensions catalog add <name> <repository> --ref <full-ref-or-oid> --trust [--json]
extensions catalog list [--no-refresh] [--json]
extensions catalog show <catalog> [<extension-id>] [--no-refresh] [--json]
extensions catalog refresh <catalog> [--json]
extensions catalog remove <catalog> [--json]
extensions search [query] [--no-refresh] [--json]
extensions install <catalog> <extension-id> --trust [--no-refresh] [--json]
extensions uninstall <extension-id> [--force] [--json]
```

Missing Catalog execution trust MUST exit `2` before refresh, package-manager,
filesystem acquisition, module import, materialization, or persisted mutation.
The thin CLI MUST delegate exact-pin reproduction, common validation, generic
execution persistence, Catalog curation linking, and rollback to core services.

#### Scenario: Versioned selector is supplied
- **WHEN** an agent passes `mail.extension@1` to a Catalog show or install form
- **THEN** parsing rejects it as invalid usage before refresh or installation

#### Scenario: Catalog lifecycle is requested as JSON
- **WHEN** an agent invokes a supported Catalog inspection or mutation with
  `--json`
- **THEN** CLI emits one deterministic result containing exact safe provenance
  and no prompts

#### Scenario: Default Catalog refresh fails
- **WHEN** Catalog list/show or Extension install cannot refresh an involved
  Catalog
- **THEN** CLI returns the mapped acquisition failure without stale success

#### Scenario: Catalog package install succeeds
- **WHEN** an agent installs a trusted npm, Git, or local Catalog entry by stable
  id
- **THEN** deterministic output presents generic execution provenance and
  separate Catalog curation provenance without credentials or managed paths

### Requirement: Separate trust acknowledgements
Catalog add MUST require repository trust acknowledgement and Catalog Extension
install MUST independently require execution trust acknowledgement. Missing
either required `--trust` MUST exit `2` before Catalog refresh or repository,
package-manager, filesystem acquisition, module import, materialization, or
persisted mutation. Direct install/update trust remains its explicit command
invocation and MUST NOT be inferred from prior Catalog trust.

#### Scenario: Install trust is omitted after Catalog trust
- **WHEN** a Catalog is registered but its Extension install omits `--trust`
- **THEN** install fails before refresh or executable effects and preserves
  configured Catalog, generic execution, and curation state

### Requirement: Relocated compiled Catalog workflow
The compiled Bun CLI SHALL build and acquire a mixed Catalog from an absolute
local Git fixture, search its inert snapshot, install literal plus npm/Git/local
entries through the generic installer, then load and list them after executable
and ctxindex state relocation with upstream access disabled.

#### Scenario: Relocated compiled CLI loads mixed Catalog provenance
- **WHEN** the compiled Catalog end-to-end test relocates an installed mixed
  Catalog and its generic materializations outside the repository tree
- **THEN** offline loading/listing succeeds from exact pins with separate
  curation provenance and no project-local, package-manager, or network access

### Requirement: Deterministic direct Extension lifecycle commands
The CLI SHALL retain these direct-install forms alongside loaded-Extension and
Catalog commands:

```text
extensions install <npm|git|local> <target> --extension <id> [--json]
extensions update <id> [--json]
extensions list [--json]
extensions uninstall <id> [--force] [--json]
```

The direct source-kind positional MUST be exact and prevent target-kind guessing.
`--extension <id>` MUST be required for direct install even when one root exists.
Direct update MUST resolve one exact direct-installed id and reuse its persisted
source kind/target. Changing a direct target or source kind MUST require
uninstall followed by install. Catalog install selectors remain distinct and
MUST NOT be reinterpreted as direct targets.

Uninstall MUST resolve one exact generic executable installation id regardless
of direct or Catalog curation origin. For Catalog-curated execution it MUST
remove the matching curation link through the same serialized guarded lifecycle
and MUST NOT leave a link that blocks Catalog removal.

Direct install/update MUST remain explicit non-interactive trust grants, require
no redundant trust flag, explain the in-process boundary, and emit a trust notice
to stderr before acquisition/import so JSON stdout remains valid. List, startup,
and uninstall MUST NOT grant trust or acquire packages. Commands MUST delegate
package behavior, persistence, complete validation, dependency guards, curation
cleanup, and removal guards to provider-neutral core.

Text/JSON output MUST be deterministic and credential-free. Direct inventory and
mutation output MUST retain stable id, source kind, sanitized requested target,
exact resolved identity, materialization digest, and installation/update time;
Catalog-curated output adds only its separate safe curation provenance. No output
may expose package-manager authentication or absolute managed paths.
Failure output MUST identify the failed lifecycle stage using sanitized
provenance without leaking embedded or ambient credentials.

#### Scenario: Direct npm install is selected exactly
- **WHEN** an agent runs `extensions install npm @example/mail@^2 --extension example.mail --json`
- **THEN** CLI grants execution trust, delegates one npm candidate for exact
  `example.mail`, and emits deterministic resolved provenance

#### Scenario: Source kind is omitted or guessed
- **WHEN** direct install supplies a target without exact `npm`, `git`, or `local`
- **THEN** parsing exits `2` before package-manager, filesystem, import, or
  persistence effects

#### Scenario: Exact Extension selection is omitted
- **WHEN** direct install omits `--extension <id>`
- **THEN** parsing exits `2` before acquisition or execution even for a
  single-root package

#### Scenario: Update is explicit and startup remains offline
- **WHEN** a mutable direct upstream target changes
- **THEN** only `extensions update <id>` may resolve it, while list and startup
  continue using the prior pin without acquisition

#### Scenario: Catalog-curated stable id is uninstalled
- **WHEN** an agent uninstalls the stable id of a Catalog-curated Extension
- **THEN** CLI removes generic execution plus Catalog curation state without a
  removed definition-version selector and preserves Source-owned data
