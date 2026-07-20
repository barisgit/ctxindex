## Why

Git Catalogs currently curate hand-written inline Extension files. The ergonomic
Extension SDK and direct installer establish a better package boundary:
`package.json#ctxindex.extensions` exports versionless Extension roots, while one
generic installer resolves npm, Git, and local package targets into immutable
managed materializations. Catalog authoring should compose those same roots and
targets without creating another package resolver, downloader, store, or
installation lifecycle.

Issue #59 adds typed Catalog authoring and an aggregate Marketplace over inert,
commit-pinned Catalog snapshots. Discovery remains data-only; explicit install
is the only path from curation metadata to trusted executable code.

## What Changes

- Add imported `defineCatalog` and `packageExtension` authoring helpers. A
  Catalog directly contains literal Extension values and/or declarative npm,
  Git, or local package targets for one stable Extension id. Catalogs never
  contain or inherit other Catalogs.
- Discover Catalog and Extension roots only from module paths declared in
  `package.json#ctxindex.extensions`; selection uses stable definition ids and
  nested Catalog entry positions, never JavaScript export names.
- Generate a strict canonical data-only snapshot before publication. Generation
  delegates target resolution and candidate inspection to the generic direct
  installer primitive, then records source-specific exact fields: npm version
  and integrity, Git commit, or contained local path and content digest, plus a
  contained exact dependency-resolution artifact and materialization digest.
  The explicit build command is the author's trust grant and warns before
  evaluating package code.
- Keep Catalog add, refresh, list, show, Marketplace search, and startup inert:
  they validate and project the committed snapshot without importing author
  modules, resolving targets, invoking Bun, or materializing packages.
- On trusted Catalog install, refresh only the selected Catalog by default,
  verify the exact snapshot entry, and ask the generic installer to reproduce
  and validate that exact resolution. Catalog code does not implement registry,
  Git, archive, package-manager, storage, lock, or garbage-collection behavior.
- Persist Catalog curation provenance separately from generic executable
  installation provenance. Refresh may advance only Catalog state; running code
  remains pinned to its immutable materialization until another explicit trusted
  install succeeds. Execution and curation activate as one durable generation
  through a single atomic pointer replacement plus directory fsync, so
  interruption cannot expose a split pair.
- Add deterministic Marketplace search across configured Catalog snapshots.
  Marketplace names the aggregate discovery/install experience; Catalog remains
  one distributable curated collection.
- Retain default command-time Catalog refresh, `--no-refresh` stored-snapshot
  operation with age visibility, repository trust and separate execution trust,
  commit-pinned execution, and offline startup.
- Replace pre-alpha versioned Extension selectors and schema-v1 records with
  stable Extension ids and a generated schema-v2 snapshot. Profiles remain the
  only versioned definition type.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `extension-catalogs`: Typed Catalog authoring, inert exact snapshots,
  npm/Git/local curation, separate curation provenance, and deterministic
  Marketplace search.
- `extension-installation`: Catalog installation delegates exact package
  reproduction and immutable execution state to the generic installer.
- `extension-loading`: Catalog and package roots use `ctxindex.extensions`,
  versionless exact selection, the common activation path, and offline managed
  materializations.
- `cli-surface`: Add Catalog build and Marketplace search while changing Catalog
  selectors and provenance output to stable Extension ids.

## Impact

- Depends on archive/sync of both `add-git-extension-catalogs` and
  `add-direct-extension-installation`; runtime work is blocked until the Catalog
  base and generic target, exact dependency-resolution artifact,
  materialization, record, lock, selection, and validation seams are canonical.
- Affects pure Catalog factories in `@ctxindex/extension-sdk`, provider-neutral
  Catalog snapshot/projection services in `@ctxindex/core`, shared generic
  installation composition, and thin CLI authoring/search/install formatting.
- Catalog schema-v1 fixtures and versioned installed records are replaced before
  release. No compatibility alias, migration, second package store, or bespoke
  npm/Git/local acquisition path is introduced.
- Private package sources may be usable only to the extent supported by the
  generic installer and its credential-redaction contract. Catalog snapshots
  never persist credentials or package-manager authentication state.
