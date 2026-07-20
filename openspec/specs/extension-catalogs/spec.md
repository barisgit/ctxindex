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

### Requirement: Strict bounded Catalog manifest
Each snapshot MUST contain a UTF-8 `ctxindex-catalog.json` at repository root of at most 256 KiB. The manifest MUST be strict schema version `1`, MUST reject unknown fields at every level, and MUST contain only `schemaVersion`, `catalog` with `id`, `name`, and optional `summary`, and at most 256 `extensions` entries with `id`, `version`, `source` `{ "kind": "inline", "path": ... }`, and optional `setup` `{ "path": ... }`. It MUST reject forbidden authentication, scopes, configuration, hosts, installers, and equivalent provider-authority fields. Catalog IDs MUST be unique across configured Catalogs and `(id, version)` extension tuples MUST be unique within a manifest.

#### Scenario: Unknown provider authority is declared
- **WHEN** a manifest contains an auth, scopes, config, hosts, or other unknown field
- **THEN** the entire Catalog candidate is rejected before persistence

#### Scenario: Duplicate extension identity is declared
- **WHEN** two manifest entries have the same Extension id and version
- **THEN** the entire Catalog candidate is rejected

### Requirement: Contained inline paths and deterministic bounds
Manifest source and setup paths MUST be normalized repository-relative POSIX paths no longer than 1024 UTF-8 bytes. Empty paths, NUL bytes, absolute paths, backslashes, dot or parent segments, non-normalized forms, and paths whose symlinks escape the snapshot MUST be rejected. Source paths MUST identify committed regular files. Optional setup files MUST identify committed regular files of at most 1 MiB.

#### Scenario: Traversal or escaping symlink is declared
- **WHEN** an entry path contains traversal or resolves through a symlink outside the snapshot
- **THEN** the Catalog candidate is rejected before persistence or activation

#### Scenario: Setup exceeds the bound
- **WHEN** an optional setup file exceeds 1 MiB
- **THEN** the Catalog candidate is rejected deterministically

### Requirement: Hardened Git execution and repository policy
System Git acquisition MUST disable terminal prompting, credential helpers, repository and global hooks, submodule recursion, LFS or smudge filters, and external protocol helpers. Remote repositories MUST use HTTPS without URL userinfo, query, or fragment components and MUST reject localhost plus literal loopback, private, link-local, unspecified, or multicast destinations. Local repositories MUST be absolute paths. SSH, credentials, private repositories, cross-repository entries, nested Catalogs, package managers, dependency resolution, and build hooks MUST NOT be supported.

#### Scenario: Unsafe remote repository is supplied
- **WHEN** a repository URL uses userinfo, a query or fragment, a non-HTTPS scheme, localhost, or a forbidden literal address
- **THEN** validation fails before Git is invoked

#### Scenario: Repository attempts ambient credential use
- **WHEN** Git would otherwise prompt or invoke a configured credential helper
- **THEN** acquisition fails without prompting or invoking the helper

### Requirement: Independent pin refresh and installed provenance
Refresh MUST validate a complete candidate snapshot before atomically advancing only the Catalog pin. It MUST NOT change any installed provenance. Install MUST require separate exact-install execution trust, validate the pinned Extension through the normal Extension validation seam, verify that the loaded Extension definition exactly matches manifest `(id, version)`, and atomically activate provenance. Identical provenance SHALL be idempotent; different valid provenance for the same `(id, version)` SHALL replace the installed record only after validation succeeds.

#### Scenario: Refresh advances a Catalog with an installed Extension
- **WHEN** refresh resolves the Catalog to a newer commit
- **THEN** the Catalog pin advances while the installed Extension remains pinned to its prior commit until explicit install

#### Scenario: Replacement candidate is invalid
- **WHEN** install targets invalid source or an identity mismatch
- **THEN** the prior installed provenance remains active unchanged

### Requirement: Safe removal, uninstall, and retained state
Catalog removal MUST fail while any installed Extension record references that Catalog. Uninstall MUST remove only activation and installed provenance. Catalog removal and uninstall MUST NOT delete Sources, Resources, or snapshots.

#### Scenario: Referenced Catalog removal is attempted
- **WHEN** an installed Extension references the requested Catalog
- **THEN** removal fails and all records and snapshots remain unchanged

#### Scenario: Extension is uninstalled
- **WHEN** a user uninstalls an installed Catalog Extension
- **THEN** its activation record is removed while Sources, Resources, and snapshots are retained

### Requirement: Strict portable persistence
Catalog and installed Extension records MUST be persisted in strict TOML alongside existing ctxindex configuration paths. Unknown or invalid fields MUST be rejected. Snapshot paths MUST be derived under `data/catalogs/<catalog-name>/<commit>` and absolute snapshot paths MUST NOT be persisted. Records MUST preserve the snapshot acquisition time so Catalog inspection, install output, and loaded Catalog provenance can surface snapshot age without repository access.

#### Scenario: State is relocated
- **WHEN** the configured ctxindex data directory changes while portable records and snapshots are moved together
- **THEN** snapshot locations are derived from the new data directory without rewriting absolute paths in provenance
