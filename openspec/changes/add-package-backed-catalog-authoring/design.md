## Context

The repository now has one direct package installer that materializes a package,
selects one Extension by stable id, validates it, publishes managed bytes, and
atomically rewrites a generic installed-extension document. Catalog authoring
must reuse that lifecycle instead of introducing Catalog-specific acquisition or
activation machinery.

Catalogs also have a stronger inertness promise than package installation:
adding, refreshing, listing, showing, or searching a Catalog must only handle
bounded data. The only executable boundaries are an explicitly trusted Catalog
build and an explicitly trusted Extension install.

## Goals / Non-Goals

**Goals**

- Author mixed Catalogs containing literal, npm, Git, and contained local
  Extension entries.
- Make snapshots deterministic and sufficient for exact future reproduction.
- Pin transitive dependencies with a sanitized Bun 1.3.14 lock artifact.
- Reuse one canonical installer for direct install, authoring resolution, and
  Catalog install.
- Make installed execution and optional Catalog curation one atomic fact.
- Keep Catalog browsing, refresh, Marketplace search, and startup data-only and
  offline-safe.
- Define an unambiguous replacement and collision policy.

**Non-goals**

- An MCP server or agent-specific integration.
- Executing a Catalog during add, refresh, list, show, or search.
- Treating mutable ranges, branches, or tags as install-time authority.
- Catalog nesting, provider authority, acquisition policy, or versioned
  Extension identity.
- Multiple activation generations, pointer switching, rollback history, or
  automatic record recovery.
- Schema migrations or compatibility aliases before the first release.

## Decisions

### 1. One canonical installer exposes authoring resolution and exact install

The existing generic installer remains the only owner of package-manager
invocation, source normalization, exact selection, complete validation,
publication, cleanup, and record persistence.

`resolveForAuthoring` accepts an explicit source target and a selection union. A
package descriptor uses `{ kind: "extension", extensionId }`; an author package
uses `{ kind: "catalog", module, catalogId? }`, where omitting the id requires a
single Catalog root in the declared module. It materializes the candidate in
an isolated staging area, discovers declared roots, selects exactly one requested
root, performs authoring validation, and returns that root together with exact
source provenance, package root, expected materialization digest, and a sanitized
lock artifact. It does not publish an installed record. This allows build to
enumerate a selected Catalog before literal entry indexes exist.

`installExact` accepts only replay data emitted in the snapshot. It reconstructs
an exact staging package, runs Bun 1.3.14 with the supplied frozen lock, verifies
source integrity/commit/containment and the materialization digest, selects and
verifies the recorded Extension, reads active state itself, performs complete
active-registry validation,
publishes managed bytes, and commits the generic record.

Direct install/update continue to call the same internal phases. No Catalog
service may invoke Bun or implement package materialization itself.

### 2. Bun 1.3.14 lock replay is authoritative and sanitized

Each executable snapshot entry references a bounded, content-addressed lock
artifact in the immutable Catalog snapshot. Its declared format is
`bun.lock@1.3.14`; its digest and bytes are covered by snapshot validation.

The snapshot retains a sanitized `requestedTarget` for explanation, but replay
authority is the lock plus exact fields. The installer rejects lock artifacts containing credentials, authentication
headers, absolute host paths, traversal, unsupported protocols, or dependencies
outside the recorded exact source/contained snapshot. npm entries also record
exact package version and integrity, Git entries record the exact commit, and
local entries record a contained normalized path and content digest. For a
literal author package, local provenance denotes the immutable Catalog snapshot
root (normally `.`), never the author's absolute checkout path.

Replay creates a sanitized staging manifest from the exact provenance and runs
the pinned Bun with frozen-lockfile, production, and ignore-scripts semantics.
It never re-resolves the original mutable request. A different source,
dependency graph, selected root, or materialization digest fails closed.

### 3. Literal entries replay the immutable author package

A literal Extension may depend on its author package layout and dependencies, so
an in-memory root is not an installable artifact. Catalog build first resolves
the author package through `resolveForAuthoring`, imports only declared entry
modules from that exact materialization, and records for each literal entry:

- normalized module path;
- Catalog id;
- zero-based entry index;
- stable Extension id;
- author-package exact source, package root, lock artifact, and expected
  materialization digest.

At install, `installExact` replays the author package from the selected immutable
Catalog snapshot, imports the exact module, selects the exact Catalog and entry
index, verifies the Extension id, and publishes the replayed author package as
managed runnable bytes. Startup never imports the Catalog snapshot or author
source checkout.

### 4. Authoring validation is intrinsic; install validation is complete

Catalog entries are alternatives, so build does not compare them with the
author's currently installed Extensions, local OAuth apps, or other Catalog
entries with the same stable id. `resolveForAuthoring` validates the selected
root and its reachable roots as a complete intrinsic package registry, including
provider contracts.

`installExact` repeats selection and intrinsic validation, then validates the
candidate in the complete active registry exactly as direct install does. A
failure leaves the previous installed record active.

### 5. Snapshot schema is inert and deterministic

Schema-v2 stores only bounded JSON data and contained artifacts. Entries are
versionless and unique by stable Extension id within one Catalog. Canonical
generation sorts entries and object keys, normalizes paths, emits stable artifact
names from content digests, and writes atomically only after every candidate
succeeds.

Catalog add/refresh/list/show/search parse, validate, store, and project this
data. They never invoke Bun, import a module, or materialize a package.

Add and refresh stage Git acquisition and snapshot validation before entering
the generic installation lifecycle lock. Their commit phase re-reads configured
Catalogs under that lock and writes from the current list: add rechecks name/id
uniqueness, while refresh requires its originally selected record to remain
unchanged and preserves its stable Catalog id. This prevents stale refresh from
resurrecting removal, prevents concurrent add/refresh list overwrites, and keeps
Catalog identity stable across an installation pre-commit check.

### 6. One atomic generic record owns execution and optional curation

The generic installed-extension record contains stable id, exact generic source,
materialization digest, package root, numeric timestamps, and an optional `curation`
member containing configured Catalog name, Catalog id, repository, selected
commit, snapshot acquisition time, and source locator.

Installation stages and fully validates bytes before taking the lifecycle lock.
Under the lock it rechecks collisions, publishes the immutable materialization,
and atomically rewrites the complete generic record document using temp file,
file sync, rename, and parent-directory sync. Failure before the record rename
keeps the prior record authoritative. Unreferenced staged or published bytes are
inert and may be cleaned up idempotently after commit or on a later lifecycle
operation.

There is no separate curation store, active-generation directory, pointer, or
history. Startup reads the strict generic document directly and never repairs or
switches records implicitly.

### 7. Only the same Catalog may replace its own curated record

A Catalog install may create an absent stable id or replace a record whose
`curation.catalog_name` and `curation.catalog_id` both match the selected
configured Catalog. This permits a refreshed commit from that same Catalog to
replace its prior installation.

Every other collision fails with an uninstall-first diagnostic: a direct generic
record, another Catalog, a builtin, or an explicit-path Extension. Exact replay
of an already identical same-Catalog record is idempotent. Direct install/update
cannot silently take over a Catalog-curated record.

Catalog uninstall is origin-neutral: it removes the generic record and its
managed bytes under the same lifecycle lock. Removing a configured Catalog is
blocked while any installed record cites it. The removal blocker check and
configured-record write share that lock with generic installation. Exact replay
remains outside the lock; before commit, Catalog installation re-reads stored
configured state under the lock and requires the selected Catalog name and id
to remain present. Thus removal winning the lock invalidates the pending install,
while install winning the lock leaves a curated record that blocks removal.

### 8. Trust and offline behavior stay explicit

Catalog build warns that it will acquire packages and import author-controlled
modules, and requires explicit author trust before either action. Adding a Git
Catalog remains a separate repository trust decision.

Catalog install requires `--trust` before refresh, artifact acquisition, Bun
execution, or import. With `--no-refresh`, it uses only the stored snapshot and
fails if required snapshot bytes are absent. Default Marketplace install refreshes
only the selected Catalog. Startup and loaded listing use only generic records
and managed bytes and never fetch, invoke Bun, or import Catalog content.

### 9. Marketplace projection remains data-only

Search is case-insensitive over stable id and summary, returns every matching
Catalog curation row including duplicate stable ids across Catalogs, and uses a
deterministic ordering. Default search refreshes configured Catalogs; stored
search and `--no-refresh` report snapshot age without network access.

## Risks / Trade-offs

- Bun lock format is runtime-specific. The schema names Bun 1.3.14 explicitly
  and rejects unknown formats rather than pretending portability.
- Replaying literal author packages costs more than serializing an in-memory
  root, but it produces real offline runnable bytes and preserves dependencies.
- A single record has no built-in rollback history. This is deliberate: atomic
  replacement preserves the prior record on failure without permanent
  generations or recovery policy.
- Intrinsic build validation cannot predict every target machine conflict.
  Complete validation is repeated at install before commit.
- Sanitization can reject valid-but-secret-bearing source forms. Authors must use
  publishable credential-free exact sources.

## Migration Plan

This is pre-alpha. Replace schema-v1 fixtures and draft split-state assumptions
directly with schema-v2 snapshots and the optional-curation generic record. Land
the canonical installer interface first, then authoring, inert Catalog storage,
trusted exact installation, CLI workflow, and documentation. No migration,
compatibility alias, generation conversion, or deprecated field is added.

## Open Questions

None. The lock format, literal locator, record shape, collision policy, and trust
boundaries are fixed by this change.
