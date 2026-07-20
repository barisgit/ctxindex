## 1. Land the generic installation prerequisite

- [ ] 1.1 Archive and sync `add-git-extension-catalogs`, then merge, archive, and
  sync `add-direct-extension-installation` with canonical npm/Git/local target
  parsing, replayable exact dependency-resolution artifacts, Bun dependency materialization, immutable
  resolved provenance, lifecycle locking, generic execution records, exact root
  selection, complete-registry validation, rollback, referenced-only cleanup,
  and offline loading. Runtime work in this change is blocked until this task is
  complete.
- [ ] 1.2 Reconcile the illustrative interface names in this change with the
  canonical generic installer without changing ownership or duplicating package
  behavior; run strict OpenSpec validation before implementation.

## 2. Pure SDK Catalog authoring

- [ ] 2.1 Add failing inference and exact-public-surface tests for
  `CatalogDefinition`, `defineCatalog`, and `packageExtension`, covering readonly
  literal/npm/Git/local entries and stable versionless Extension ids.
- [ ] 2.2 Implement effect-free plain factories by consuming the canonical
  generic target type; reject duplicate ids, nested Catalogs, and textual
  dependency refs through runtime validation.
- [ ] 2.3 Run focused SDK tests, typecheck, copy-compatibility, and dependency
  direction checks as the Slice gate.

## 3. Inert schema-v2 Catalog state

- [ ] 3.1 Add failing schema/path/store tests for versionless entries, closed
  literal/package source unions, source-specific exact generic provenance,
  contained local targets and generic dependency-resolution artifacts, canonical
  ordering, strict configured Catalog v2 records, and separate Catalog curation
  links.
- [ ] 3.2 Replace pre-alpha versioned schema-v1 Catalog fixtures and records with
  fail-closed v2 state; add relocation and age tests without a compatibility
  reader or automatic deletion.
- [ ] 3.3 Run complete Catalog schema/store/path and portable relocation tests as
  the Slice gate.

## 4. Typed snapshot generation through the generic installer

- [ ] 4.1 Add failing local-author-package tests for
  `package.json#ctxindex.extensions`, generic Extension/Catalog root inspection,
  exact Catalog-id selection, literal nested indices, unknown future roots,
  malformed recognized roots, duplicate ids, and absence of export-name state.
- [ ] 4.2 Add failing injected-generic-installer tests for npm, Git, and contained
  local entries, sanitized requested targets, exact resolved provenance,
  replayable dependency-resolution artifacts, transitive range drift, exact
  Extension selection, non-traversal of Catalog roots, and no Catalog-owned
  registry/downloader/extractor/materialization behavior.
- [ ] 4.3 Add failing trust-order tests proving Catalog build itself is the
  non-interactive author grant, warns before package materialization/import,
  preserves valid JSON stdout, and publishes no execution record.
- [ ] 4.4 Add failing canonical-output tests for deterministic entry/source
  ordering, byte-identical no-op, failure preservation, and regeneration drift;
  implement atomic snapshot build.
- [ ] 4.5 Run package-entry, authoring, architecture, and no-unapproved-egress
  checks as the Slice gate.

## 5. Data-only Catalog and Marketplace lifecycle

- [ ] 5.1 Add failing service tests proving add/refresh/list/show/search validate
  inert snapshot data without package-manager, registry, original-local-path,
  module-import, materialization, or execution-state effects.
- [ ] 5.2 Add failing Marketplace tests for case-insensitive id/summary matching,
  duplicate curation rows, exact ordering, all-Catalog refresh order/failure,
  selected-only show refresh, stored operation, and snapshot age.
- [ ] 5.3 Implement the smallest configured-Catalog projection and Marketplace
  search changes and run focused lifecycle/egress tests as the Slice gate.

## 6. Trusted exact Catalog installation

- [ ] 6.1 Add failing tests proving Catalog execution trust is checked before
  refresh, generic materialization, import, or mutation, while repository trust
  remains independent.
- [ ] 6.2 Add failing literal tests for exact commit/module/Catalog-id/nested-index
  recollection, stable id verification, and common complete-registry activation.
- [ ] 6.3 Add failing npm/Git/local tests proving Catalog delegates exact-pin
  reproduction, exact dependency-lock replay, digests, locking, publication, and
  cleanup to the generic installer and never re-resolves mutable requested or
  transitive targets.
- [ ] 6.4 Add failing state tests for separate generic execution and Catalog
  curation records, idempotence, atomic replacement, refresh-stable execution,
  guarded Catalog removal/uninstall, and retained Source-owned data.
- [ ] 6.5 Run shared installer, Catalog service, complete-registry, conflict,
  rollback, relocation, offline/degraded loading, and egress suites as the Slice
  gate.

## 7. Thin versionless CLI and compiled workflow

- [ ] 7.1 Add failing parser/command tests for Catalog build, Marketplace search,
  versionless Catalog show/install, default/`--no-refresh`, ambiguous Catalog
  roots, trust-before-effects, JSON, and typed exits.
- [ ] 7.2 Add failing formatter tests for deterministic duplicate Marketplace
  rows, snapshot age, literal locators, exact npm/Git/local execution provenance,
  separate Catalog curation provenance, and absence of versions/export names,
  credentials, auth state, or managed paths.
- [ ] 7.3 Extend local compiled fixtures to build a mixed Catalog, search it,
  install literal/npm/Git/local entries through the generic materializer, restart
  offline, relocate state, refresh without changing execution, and exercise
  guarded uninstall without external network.
- [ ] 7.4 Run CLI parser/command/e2e, no-prompts, thin-lines, module architecture,
  network-egress, and compiled Extension/Catalog gates as the Slice gate.

## 8. Doctrine and final verification

- [ ] 8.1 Regenerate official/example Catalog snapshots and refresh affected
  codemaps through cartography.
- [ ] 8.2 Promote only the ownership and interface doctrine listed in
  `implementation.md` into canonical extension-catalogs,
  extension-installation, extension-loading, and cli-surface sidecars.
- [ ] 8.3 Refresh `SYSTEM.md` through system-reference, run focused regeneration
  drift, `bun run ci`, `bunx openspec validate --all --strict`, and
  `openspec-verify-change`; resolve every finding and retain the completed change
  unarchived until explicitly requested.
