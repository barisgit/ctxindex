## Context

Issue #23 established Git Catalog acquisition with two trust gates, immutable
commit snapshots, offline startup, command-time refresh, and installed pins that
do not move when a Catalog refreshes. The SDK redesign makes Extensions plain,
versionless roots exported from `package.json#ctxindex.extensions`. The direct
installer is establishing the one npm/Git/local package-manager boundary,
immutable materialization store, exact root selector, complete-registry
validator, lifecycle lock, and generic execution record.

This change must add typed Catalog authoring and Marketplace discovery without
forking any of those responsibilities. A Catalog is a distributable curated
collection. Marketplace is only the aggregate search/install experience across
configured Catalogs.

## Goals / Non-Goals

**Goals:**

- Author Catalogs with imported factories and type-safe literal or package
  entries.
- Curate npm, Git, and local packages using the exact generic target language.
- Generate a closed, canonical, data-only snapshot with exact immutable
  resolution metadata.
- Keep refresh/search/list inert and startup offline.
- Reproduce one snapshot pin through the generic installer only after the
  separate Catalog execution-trust acknowledgement.
- Keep curation provenance independent from executable installation provenance.
- Search all configured Catalogs deterministically without choosing a preferred
  source for duplicate curation.

**Non-Goals:**

- A package resolver, downloader, archive extractor, materialization store,
  lifecycle lock, dependency solver, garbage collector, or second installer in
  Catalog code.
- Nested Catalogs, Catalog dependencies, inherited entries, or textual
  Extension dependency references.
- Hosted Marketplace accounts, billing, rankings, reviews, moderation,
  signatures, or transparency infrastructure.
- Automatic update, startup acquisition, refresh-driven execution changes, or
  weakening in-process execution trust.
- Reintroducing Extension definition versions. Profile ids and versions remain
  distinct from stable Extension ids.

## Decisions

1. **Catalog modules are authoring input; generated snapshots are discovery
   input.** `defineCatalog` returns a plain Catalog root with a stable id, label,
   optional summary, and direct entries. An explicit build command imports local
   modules declared in `package.json#ctxindex.extensions`, selects one Catalog by
   id, and writes `ctxindex-catalog.json`. End-user acquisition and every
   discovery operation read only that JSON. Executing newly fetched author code
   during refresh was rejected because it collapses repository and code trust.

2. **One package entry convention serves Extension and Catalog roots.** Only
   normalized paths in `package.json#ctxindex.extensions` are inspected. All
   exported values are examined without persisting export names. Valid Extension
   and Catalog roots are collected by discriminator; malformed recognized roots
   fail, unrelated/future values are ignored, and selected ids must be exact.
   Runtime loading ignores Catalog roots except when a trusted literal Catalog
   install explicitly selects a nested Extension.

3. **Catalog entries are direct values or inert package descriptors.** A literal
   entry is an exact imported Extension object. `packageExtension` accepts one
   explicit generic source kind (`npm`, `git`, or `local`), its target, and one
   stable Extension id. It returns data only and never resolves the target.
   Catalog entries cannot be Catalogs, textual dependencies, transitive refs, or
   implicit sibling roots. Multiple Catalogs may independently curate the same
   Extension id; one Catalog may contain that id only once.

4. **The generic installer owns all target resolution and materialization.**
   Catalog build calls the same injected resolver/materializer used by direct
   install to resolve a mutable target, materialize its ordinary dependencies,
   inspect `ctxindex.extensions`, select the exact Extension id, and return safe
   exact provenance. Catalog core may serialize that result but cannot query npm,
   invoke Git/Bun, extract archives, publish package trees, lock lifecycle state,
   or collect garbage itself. Exact-target reproduction during install delegates
   to the corresponding generic installer operation and fails if resolution,
   ordinary transitive package dependency graph, integrity/content digest,
   materialization digest, selected id, or validation differs from the snapshot.
   This graph never includes ctxindex Extension dependency declarations or
   sibling exported Extension roots. To make the package graph replayable rather
   than merely identifiable, the generic
   installer exports one bounded sanitized exact resolution artifact. Authoring
   commits it under a content-addressed contained path and the snapshot records
   its format/digest/path. Install verifies and passes the artifact back to the
   generic installer. Catalog code transports bytes but never interprets the
   lock format or owns its lifecycle.
   Catalog build itself is the explicit non-interactive author trust grant and
   emits the same pre-effect warning discipline as direct install/update. No
   redundant trust flag is required because authoring is already an explicit
   executable operation; discovery commands never inherit that grant.

5. **Schema version 2 is a closed inert snapshot.** Each entry has a stable
   Extension id, optional summary, and exactly one source. A literal source
   records the declared Catalog module, selected Catalog id, and stable nested
   entry index. An npm source records sanitized requested target, exact version,
   required integrity, dependency-resolution artifact, and materialization
   digest. A Git source records sanitized requested target, exact commit,
   dependency-resolution artifact, and materialization digest. A local source
   records normalized contained path, required content digest, dependency-
   resolution artifact, and materialization digest. Generation metadata names
   the author package and module without credentials. No range is re-resolved by
   refresh or install; the requested target is explanatory/update provenance and
   exact resolved fields and the generic resolution artifact are authoritative.

6. **Local package entries are snapshot-contained.** A Catalog-authored local
   target must resolve from the Catalog package root to a normalized contained
   package directory. The generated digest pins its content and the Catalog
   commit transports it. Install supplies the contained path from the pinned
   snapshot to the generic materializer and requires the resulting exact digests
   to match. Absolute author-machine paths cannot enter the snapshot.

7. **Literal entries select nested roots from the pinned Catalog snapshot.** The
   generated source identifies the Catalog entry module, Catalog id, and nested
   index. After execution trust, install imports that exact module from the exact
   Catalog commit, recollects the Catalog, verifies the indexed Extension id, and
   passes the selected root through the common complete-registry validator.
   Literal author modules must be runnable self-contained snapshot artifacts;
   discovery never imports them.

8. **Curation and execution provenance are separate records.** The generic
   installation record owns the stable Extension id, exact source resolution,
   immutable materialization digest/path derivation, and lifecycle timestamps.
   A Catalog curation link separately owns Catalog local name/id, repository,
   exact commit, snapshot acquisition time, entry source locator, and the linked
   execution pin. Catalog refresh replaces only configured Catalog state.
   Reinstall writes execution and curation as distinct members of one inactive
   activation generation, durably persists that complete generation, and makes
   it visible through one atomic active-generation pointer replacement followed
   by pointer-directory fsync. Startup reads only pointer-reachable generations.
   No prior generation is cleaned before that durable commit. Interruption
   before it leaves both complete recovery choices; interruption after it
   exposes the complete new pair and leaves at most retryable inactive cleanup
   state.

9. **Marketplace preserves duplicate curation.** Search matches a
   case-insensitive substring over snapshot Extension id and summary, retains one
   row per Catalog entry, and sorts by Extension id, Catalog local name, then
   exact source locator. It never imports code, resolves targets, or selects a
   preferred Catalog.

10. **Command-time freshness and both trust gates remain.** Catalog list and
    Marketplace search refresh configured Catalogs in local-name order. Catalog
    show and install refresh only the selected Catalog. `--no-refresh` uses stored
    snapshots and reports age. Catalog add still requires repository trust;
    Catalog install still requires separate `--trust` for in-process execution.
    A refresh-enabled install executes only the exact newly pinned entry.

11. **Implementation is sequenced after direct install.** This branch may merge
    its reconciled artifacts, but runtime tasks stay blocked until the direct
    installer contracts are implemented and canonical. At that point Catalog
    code consumes those contracts rather than copying provisional branch code.

## Risks / Trade-offs

- [Generic materializer contracts may change before merge] -> Keep this change
  unimplemented until direct install is canonical, then update interface names
  without changing the ownership boundary.
- [Generated snapshots can drift from authoring modules] -> Regenerate in CI and
  compare canonical bytes.
- [A digest alone cannot reconstruct transitive dependency versions] -> Commit
  the generic installer's exact sanitized dependency-resolution artifact and
  require exact replay or failure during trusted install.
- [Mutable npm/Git inputs can resolve differently on later builds] -> Build
  records exact generic provenance once; refresh never resolves it and install
  must reproduce that exact pin.
- [Local targets are not globally portable] -> Permit only contained paths whose
  bytes travel in the Catalog commit and verify their content digest on install.
- [Package code still has full process privileges] -> Preserve the separate
  execution-trust flag and never describe validation as sandboxing.
- [Duplicate curation can look repetitive] -> Keep provenance-visible rows and
  require exact Catalog selection instead of hidden ranking.
- [Separate typed records could become inconsistent after interruption] -> Stage
  them in one inactive activation generation and use a single durable pointer
  switch plus directory fsync as the activation commit; recovery never activates
  unreferenced state or cleans the prior generation before pointer durability.

## Migration Plan

This pre-alpha change replaces Catalog manifest and record schema version 1.
Existing development Catalog installations must be explicitly removed and
re-added after regeneration; no automatic deletion, compatibility reader, or
deprecated versioned selector is introduced.

Runtime implementation begins only after `add-direct-extension-installation`
lands. It then removes the Catalog-specific installed-code record in favor of
the generic execution record plus a separate Catalog curation link, regenerates
fixtures, and validates relocation/offline behavior before activation.

## Open Questions

None.
