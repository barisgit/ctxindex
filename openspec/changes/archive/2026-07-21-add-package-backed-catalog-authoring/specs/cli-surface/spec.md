## ADDED Requirements

### Requirement: Deterministic trusted Catalog authoring command

The CLI SHALL provide a non-interactive Catalog build command that accepts an
author package, optional Catalog id, and output location. It SHALL derive the
single declared ctxindex entry module from the package manifest and fail
deterministically when the package declares multiple entry modules. It SHALL show
or return a trust warning covering package acquisition, Bun execution, and
author-controlled module import, and SHALL require explicit trust before any of
those actions.

The command SHALL generate deterministic schema-v2 output through the Catalog
authoring service and canonical installer's `resolveForAuthoring` operation. It
SHALL write no partial output when any candidate fails.

#### Scenario: Generated snapshot is current

- **WHEN** a trusted build succeeds for the same exact inputs twice
- **THEN** canonical snapshot and content-addressed lock artifact bytes are
  identical

#### Scenario: Candidate generation fails

- **WHEN** resolution, lock sanitization, import, exact selection, or validation
  fails
- **THEN** the command returns the stable failure and preserves prior output

### Requirement: Deterministic aggregate Extension search

The CLI SHALL provide Marketplace search over configured Catalog snapshots with
human and `--format json` output. It SHALL match id and summary case-insensitively,
retain duplicate curation rows across Catalogs, and use deterministic ordering.

Default search SHALL refresh configured Catalogs. `--no-refresh` SHALL use only
stored state, perform no network or execution, and report snapshot age.

#### Scenario: Marketplace search is requested as JSON

- **WHEN** matching entries exist in multiple Catalogs
- **THEN** JSON output contains every matching curation row in deterministic
  order with source kind and exact pin or locator metadata

#### Scenario: Stored Marketplace search is requested

- **WHEN** `--no-refresh` is supplied
- **THEN** output uses stored snapshots, includes acquisition age, and invokes no
  package manager or import

### Requirement: Marketplace-facing refresh scope

Default Catalog install SHALL refresh only the explicitly selected configured
Catalog after execution trust is accepted. `--no-refresh` SHALL use only its
stored snapshot and fail deterministically if required snapshot or replay
artifact bytes are absent. Refresh failure SHALL occur before install mutation.

#### Scenario: Install refreshes one Catalog

- **WHEN** a user trusts installation from one configured Catalog without
  `--no-refresh`
- **THEN** only that Catalog refreshes before exact entry selection

#### Scenario: Default Marketplace refresh fails

- **WHEN** the selected Catalog cannot refresh or validate
- **THEN** install fails without invoking Bun or changing installed state

### Requirement: Loaded Extension provenance output

Loaded/listing output SHALL expose exact generic source provenance and, when
present, configured Catalog name, Catalog id, commit, and source locator from the
same generic installed record. Output SHALL NOT imply that the currently
refreshed Catalog commit is the installed commit.

#### Scenario: Offline loaded listing is requested

- **WHEN** a Catalog-curated Extension is listed while offline
- **THEN** output reports persisted installed provenance without refreshing or
  opening the Catalog snapshot

## MODIFIED Requirements

### Requirement: Deterministic Git Catalog command surface

The CLI SHALL keep explicit commands for Catalog add, refresh, list, show,
remove, build, Marketplace search, and Catalog-selected install. Catalog entries
and selectors SHALL use stable versionless Extension ids.

Catalog install SHALL require an explicit configured Catalog name and trust:

```text
ctxindex extensions install <catalog> <extension-id> --trust [--no-refresh]
```

Catalog lifecycle and Marketplace read commands SHALL operate on inert stored
data only. Catalog install SHALL delegate exact replay to the canonical generic
installer and SHALL return source-neutral results and stable errors.

#### Scenario: Versioned selector is supplied

- **WHEN** a Catalog command receives a versioned Extension selector
- **THEN** parsing or validation rejects it

#### Scenario: Catalog lifecycle is requested as JSON

- **WHEN** add, refresh, list, show, remove, search, or install is requested with
  `--format json`
- **THEN** the CLI returns deterministic structured output without prompts

#### Scenario: Catalog package install succeeds

- **WHEN** a trusted exact Catalog entry passes replay, selection, collision, and
  complete validation
- **THEN** output identifies its stable id, Catalog name/id, commit, source kind,
  exact pin or literal locator, and install/update time

### Requirement: Separate trust acknowledgements

Repository, authoring, and install trust SHALL be separate acknowledgements.
Install trust SHALL be checked before
default refresh, replay-artifact acquisition, Bun execution, module import, or
managed publication. A prior repository or build trust SHALL NOT satisfy install
trust.

#### Scenario: Install trust is omitted after Catalog trust

- **WHEN** a Catalog was previously added or built with trust but install omits
  `--trust`
- **THEN** the command fails before refresh, acquisition, Bun, or import

### Requirement: Relocated compiled Catalog workflow

The compiled Catalog workflow SHALL cover building a mixed literal/Git/local
Catalog, adding and refreshing it, deterministic search, trusted exact install,
same-Catalog replacement, different-origin collision rejection, origin-neutral
uninstall, relocation of complete state, and offline startup from managed bytes.
Exact npm replay through the shared canonical installer SHALL remain covered by
focused installer tests and the relocated compiled direct npm workflow rather
than a second Catalog-specific registry and tarball fixture.

#### Scenario: Relocated compiled CLI loads mixed Catalog provenance

- **WHEN** generated state is moved and network, Bun, upstream repositories, and
  author checkouts are unavailable
- **THEN** the compiled CLI loads installed package and literal entries from
  managed bytes and reports persisted exact and Catalog provenance

### Requirement: Deterministic direct Extension lifecycle commands

The CLI SHALL retain explicit direct npm, Git, and local install/update forms
with exact Extension selection and trust. Direct and Catalog-backed commands
SHALL share the canonical installer and generic installed-extension record.

Direct install SHALL reject an existing managed stable id. Direct update SHALL
require a direct record and SHALL NOT take over Catalog-curated state. Catalog
install SHALL replace only the same configured Catalog name and Catalog id. All
other managed, builtin, and explicit-path collisions SHALL instruct the user to
uninstall first.

Uninstall SHALL remain origin-neutral:

```text
ctxindex extensions uninstall <extension-id>
```

#### Scenario: Direct npm install is selected exactly

- **WHEN** direct npm installation includes explicit source kind, target,
  Extension id, and trust
- **THEN** the shared installer selects exactly that Extension and writes a
  generic record without Catalog curation

#### Scenario: Source kind is omitted or guessed

- **WHEN** a direct package command does not explicitly identify npm, Git, or
  local source kind
- **THEN** the CLI rejects it instead of guessing

#### Scenario: Same Catalog update is explicit

- **WHEN** Catalog install selects the same configured Catalog name and Catalog
  id at a newer commit
- **THEN** trusted exact replay may atomically replace its prior generic record

#### Scenario: Different origin collides

- **WHEN** direct or Catalog install targets an id owned by a different allowed
  origin, builtin, or explicit path
- **THEN** the command fails with uninstall-first guidance and preserves state

#### Scenario: Catalog-curated stable id is uninstalled

- **WHEN** origin-neutral uninstall targets a Catalog-curated record
- **THEN** the CLI removes its generic record and managed bytes without requiring
  refresh, Bun, or Catalog availability
