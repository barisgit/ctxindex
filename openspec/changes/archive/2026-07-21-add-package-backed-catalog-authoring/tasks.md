## 1. Completed prerequisites

- [x] 1.1 Archive and sync `add-git-extension-catalogs`, then merge, archive, and
  sync `add-direct-extension-installation`; confirm the landed direct installer
  owns npm/Git/local materialization, exact root selection, complete validation,
  lifecycle locking, generic record persistence, managed publication, cleanup,
  and offline loading.

## 2. Canonical installer authoring and exact replay seam

- [x] 2.1 Add failing interface and architecture tests for distinct
  `resolveForAuthoring` and `installExact` operations on the canonical generic
  installer, proving Catalog modules cannot implement Bun, selection,
  publication, record persistence, or cleanup themselves.
- [x] 2.2 Add failing resolver tests for npm, Git, and immutable contained-local
  authoring inputs: `{ kind: "extension", extensionId }` selection for package
  descriptors, `{ kind: "catalog", module, catalogId? }` selection returning the
  Catalog root for author-package enumeration, intrinsic package validation,
  sanitized explanatory requested target, exact version/integrity or commit
  provenance, contained path/content digest,
  normalized package root, materialization digest, staging cleanup, and no
  installed-record publication.
- [x] 2.3 Implement `resolveForAuthoring` by reusing the direct installer's
  materialization, declared-module discovery, exact selection, validation, and
  digest helpers; reconcile illustrative names with the landed interfaces.
- [x] 2.4 Add failing Bun 1.3.14 lock sanitizer tests for deterministic bytes,
  content-addressed paths, size/digest bounds, credentials and auth data,
  absolute/traversing/escaping paths, external file dependencies, mutable Git
  refs, unsupported protocols, scripts, and unknown lock formats.
- [x] 2.5 Add failing `installExact` tests proving sanitized staging-manifest
  creation, exact lock-byte replay, pinned Bun 1.3.14 frozen/production/
  ignore-scripts arguments, non-interactive credential-free environment, exact
  npm integrity/Git commit/local digest checks, package-root and materialization
  digest verification, and no mutable re-resolution.
- [x] 2.6 Implement sanitized lock emission and exact replay inside the canonical
  installer, sharing source verification, validation, publication, and cleanup
  with direct install/update.
- [x] 2.7 Run focused installer unit/integration tests, typecheck, architecture
  checks, and compiled-extension regression tests.

## 3. Pure SDK Catalog authoring

- [x] 3.1 Add failing inference, excess-property, exact-public-surface,
  copy-compatibility, and dependency-boundary tests for `CatalogDefinition`,
  `defineCatalog({ id, label, summary?, extensions })`, exported
  `ExtensionPackageTarget { kind, target }`, and
  `packageExtension(source, extensionId)` returning
  `{ kind: "package-extension", source, extensionId }`, with literal/npm/Git/local
  entries and stable versionless ids.
- [x] 3.2 Implement the smallest effect-free plain factories and reject nested
  Catalogs and other unsupported values in Catalog `extensions`.
- [x] 3.3 Run focused SDK tests, typecheck, copy-compatibility, and dependency
  boundary checks.

## 4. Deterministic schema-v2 Catalog authoring

- [x] 4.1 Add failing schema tests for the closed replay payload: exact source,
  package root, materialization digest, `bun.lock@1.3.14` artifact reference,
  artifact digest/byte bounds, versionless identity, uniqueness, normalized
  contained paths, and total snapshot limits.
- [x] 4.2 Add failing literal-author-package tests proving build resolves the
  immutable author package through `resolveForAuthoring`, imports only declared
  modules without requiring a top-level Extension, selects the exact Catalog,
  and records module/Catalog id/entry index/
  Extension id plus author-package replay metadata.
- [x] 4.3 Add failing package-entry tests proving npm/Git/local targets delegate
  to `resolveForAuthoring`, record only exact replay authority, and never install
  an Extension during build.
- [x] 4.4 Add failing author-trust tests proving no author-package acquisition,
  Bun invocation, or module import occurs before explicit build trust.
- [x] 4.5 Add failing canonical-output tests for stable ordering and paths,
  content-addressed lock deduplication, identical repeated build bytes, all-or-
  nothing atomic output, and prior-output preservation on any candidate failure.
- [x] 4.6 Implement trusted mixed-Catalog build and replace pre-alpha schema-v1
  fixtures/state directly with schema-v2; add no migration or compatibility
  aliases.
- [x] 4.7 Run focused authoring, schema, path-containment, relocation,
  architecture, and no-unapproved-egress tests.

## 5. Inert Catalog and Marketplace lifecycle

- [x] 5.1 Add failing tests proving add, refresh, list, show, search, and snapshot
  parsing validate/store/project only bounded data and cannot call Bun, import,
  materialize, publish, or mutate installed records.
- [x] 5.2 Add failing hardened Git repository tests for separate add trust,
  non-interactive credential-free acquisition, exact commit storage, and no
  installed mutation on refresh.
- [x] 5.3 Add failing Marketplace tests for case-insensitive id/summary matching,
  deterministic ordering, duplicate curation rows across Catalogs, default
  refresh, stored `--no-refresh`, snapshot age, and refresh failure.
- [x] 5.4 Implement the smallest configured-Catalog projection and Marketplace
  query service over stored schema-v2 data.
- [x] 5.5 Run focused Catalog store/service, Git hardening, Marketplace,
  inertness, and portable-state tests.

## 6. One generic record with optional Catalog curation

- [x] 6.1 Add failing strict-store tests for a generic record containing exact
  execution fields and optional Catalog curation in one atomically rewritten
  document; reject unknown fields, invalid relative paths, split execution/
  curation state, non-numeric timestamps, generations, pointers, and history.
- [x] 6.2 Add failing interruption tests for publication before record rename,
  synced atomic replacement, prior-record authority on failure, inert orphan
  bytes, idempotent later cleanup, and no startup repair or alternate-record
  scanning.
- [x] 6.3 Extend the landed generic record/store with optional configured Catalog
  name, Catalog id, repository, commit, snapshot-acquired time, and exact source
  locator; keep direct records curation-free.
- [x] 6.4 Run focused persistence, lifecycle-lock, interruption, cleanup,
  corruption, and relocation tests.

## 7. Trusted exact Catalog installation

- [x] 7.1 Add failing trust-order tests proving Catalog install checks `--trust`
  before default refresh, replay-artifact acquisition, Bun, import, publication,
  or installed-state mutation; prove `--no-refresh` uses stored bytes only.
- [x] 7.2 Add failing package-entry tests proving install delegates the exact
  snapshot replay payload to `installExact`, rejects upstream/source/lock/root/
  digest drift, selects only the requested Extension, and has the installer read
  active state itself for complete registry validation before commit.
- [x] 7.3 Add failing literal tests proving exact author-package replay, exact
  module/Catalog id/entry index/Extension id locator verification, complete
  validation, full author-package managed publication, and offline startup with
  Catalog checkout, network, and Bun unavailable.
- [x] 7.4 Add failing collision tests for absent-id create, idempotent replay,
  same configured Catalog name plus Catalog id replacement, and uninstall-first
  failures for direct records, other Catalogs, builtins, and explicit paths;
  prove direct update cannot take over curated state.
- [x] 7.5 Add failing uninstall/removal tests proving origin-neutral uninstall
  needs no Catalog/network/Bun and Catalog removal is blocked while any generic
  record's curation references it.
- [x] 7.6 Implement Catalog selection and trust orchestration as a thin service
  around `installExact`, the generic record store, and origin-neutral uninstall.
- [x] 7.7 Run focused shared-installer, Catalog service, complete-registry,
  collision, uninstall, offline-loading, and no-unapproved-egress tests.

## 8. Thin CLI and compiled workflow

- [x] 8.1 Add failing parser/command tests for Catalog build, lifecycle, search,
  versionless positional `<catalog> <extension-id>` install with explicit
  `--trust`/optional `--no-refresh`, existing direct source-explicit forms, and origin-neutral
  uninstall.
- [x] 8.2 Add failing human/JSON formatter tests for deterministic duplicate
  Marketplace rows, snapshot age, exact source pin or literal locator, Catalog
  provenance, install/update timestamps, and uninstall-first conflicts.
- [x] 8.3 Extend source and compiled local fixtures to build a mixed
  literal/Git/contained-local Catalog, add/refresh/search/install it, replace
  from the same Catalog, reject a different-origin collision, relocate state,
  start offline from managed bytes, and uninstall without Catalog availability.
  Retain exact npm replay in focused canonical-installer tests rather than
  duplicate the compiled-direct local registry and tarball fixture here.
- [x] 8.4 Run CLI parser/command/formatter/e2e, no-prompts, thin-lines, module
  architecture, and compiled-extension gates.

## 9. Doctrine and final verification

- [x] 9.1 Regenerate official/example schema-v2 Catalog snapshots and refresh
  affected codemaps through the `cartography` skill.
- [x] 9.2 Promote only durable ownership and interface doctrine to current specs
  and accepted design: one canonical installer, exact sanitized lock replay,
  inert Catalog read paths, one generic record with optional curation, offline
  loading, and same-Catalog-only replacement.
- [x] 9.3 Refresh `SYSTEM.md` through `system-reference`; run all focused gates,
  `bun run ci`, `bunx openspec validate --all --strict`, and
  `openspec-verify-change` before archive.
