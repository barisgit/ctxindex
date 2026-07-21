## Capability Implementation Targets

Implement typed Catalog authoring, deterministic schema-v2 generation,
data-only Marketplace projection, and exact trusted Catalog installation by
extending the canonical generic installer. Keep command handlers thin and keep
all persisted execution state in the generic installed-extension document.

## Module Ownership

- SDK owns effect-free Catalog and entry values/factories. It owns no filesystem,
  package manager, import, trust, or persistence behavior.
- Generic extension installation owns source parsing, Bun invocation, exact
  resolution, lock sanitization/replay, root discovery/selection, validation,
  managed publication, collision checks, cleanup, and generic record storage.
- Catalog authoring orchestrates declared author modules and calls
  `resolveForAuthoring`; it does not materialize packages itself.
- Catalog schema/storage owns strict bounded snapshot data and contained replay
  artifacts. Catalog lifecycle never imports or invokes Bun.
- Catalog service projects Marketplace rows and calls `installExact` after trust
  and optional refresh.
- Extension loading consumes only generic installed records and managed bytes.
- CLI parses explicit commands, gathers trust, and formats results.

Architecture tests MUST reject Bun, dynamic-import, materializer, installed
store, and managed-publication dependencies from SDK, Catalog schema/storage,
Marketplace projection, and CLI formatter modules.

## Interfaces and Data Flow

### Pure Catalog authoring values

The SDK public surface uses plain copy-compatible values:

```ts
type ExtensionPackageTarget =
  | { readonly kind: "npm"; readonly target: string }
  | { readonly kind: "git"; readonly target: string }
  | { readonly kind: "local"; readonly target: string };

interface PackageExtensionDescriptor<
  TTarget extends ExtensionPackageTarget = ExtensionPackageTarget,
  TExtensionId extends string = string,
> {
  readonly kind: "package-extension";
  readonly source: TTarget;
  readonly extensionId: TExtensionId;
}

type CatalogEntry = AnyExtensionDefinition | PackageExtensionDescriptor;

type CatalogEntryId<TEntry extends CatalogEntry> =
  TEntry extends ExtensionDefinition<infer TId>
    ? TId
    : TEntry extends PackageExtensionDescriptor<ExtensionPackageTarget, infer TId>
      ? TId
      : never;

interface CatalogDefinition<TEntries extends readonly CatalogEntry[]> {
  readonly kind: "catalog";
  readonly id: string;
  readonly label: string;
  readonly summary?: string;
  readonly entrySummaries?: Readonly<
    Partial<Record<CatalogEntryId<TEntries[number]>, string>>
  >;
  readonly extensions: TEntries;
}

declare function defineCatalog(value: CatalogDefinition): CatalogDefinition;
declare function packageExtension(
  source: ExtensionPackageTarget,
  extensionId: string,
): PackageExtensionDescriptor;
```

Factories are effect-free identity helpers with inference and excess-property
checking. `extensions` accepts only literal Extension definitions or package
descriptors; Catalogs and other values are rejected. `entrySummaries` is keyed
by the ids inferred from those entries, remains separate from the Catalog's own
summary, and supplies inert Marketplace metadata without wrapping or changing
the selected Extension values.

### Canonical installer seam

The illustrative boundary is:

```ts
interface ExactResolutionArtifact {
  format: "bun.lock@1.3.14";
  relativePath: string;
  sha256: string;
  byteLength: number;
}

type ExactExtensionSource =
  | {
      kind: "npm";
      requestedTarget: string;
      package: string;
      version: string;
      integrity: string;
    }
  | {
      kind: "git";
      requestedTarget: string;
      repository: string;
      commit: string;
    }
  | {
      kind: "local";
      requestedTarget: string;
      relativePath: string;
      contentDigest: string;
    };

type AuthoringSelection =
  | { kind: "extension"; extensionId: string }
  | { kind: "catalog"; module: string; catalogId?: string };

interface ReplayPayload {
  source: ExactExtensionSource;
  packageRoot: string;
  materializationDigest: string;
  lock: ExactResolutionArtifact;
}

interface AuthoringResolution {
  selection: AuthoringSelection;
  replay: ReplayPayload;
  selectedRoot: AnyExtensionDefinition | CatalogDefinition;
  dispose(): Promise<void>;
}

interface LiteralReplayLocator {
  module: string;
  catalogId: string;
  entryIndex: number;
  extensionId: string;
}

type ExactInstallSelection =
  | { kind: "extension"; extensionId: string }
  | ({ kind: "catalog-entry" } & LiteralReplayLocator);

interface CatalogCuration {
  catalogName: string;
  catalogId: string;
  repository: string;
  commit: string;
  snapshotAcquiredAt: number;
  sourceLocator:
    | { kind: "package"; entryIndex: number }
    | ({ kind: "literal" } & LiteralReplayLocator);
}

interface GenericExtensionInstaller {
  resolveForAuthoring(input: {
    target: ExtensionPackageTarget;
    selection: AuthoringSelection;
    immutableBaseRoot?: string;
  }): Promise<AuthoringResolution>;

  installExact(input: {
    replay: ReplayPayload;
    lockBytes: Uint8Array;
    immutableSnapshotRoot: string;
    selection: ExactInstallSelection;
    curation?: CatalogCuration;
  }): Promise<GenericInstalledExtensionRecord>;
}
```

Concrete names may follow the landed direct installer, but these two operations
and their ownership must remain explicit. Direct install/update reuse the same
private resolution/replay phases; they do not create a parallel adapter.

`resolveForAuthoring`:

1. normalizes the requested npm, Git, or contained local target;
2. materializes it under an isolated staging root with Bun 1.3.14 and scripts
   disabled;
3. discovers declared entry modules and selects exactly one requested Extension
   or Catalog root;
4. validates the selected intrinsic package registry;
5. returns the selected root for build-time enumeration and derives exact source
   provenance, normalized package root, and canonical
   materialization digest;
6. sanitizes and validates the Bun lock, emits a content-addressed artifact, and
   returns replay metadata without publishing an installed record;
7. cleans staging on success or failure.

`installExact`:

1. validates artifact path, size, digest, format, and sanitization;
2. constructs a sanitized staging manifest from recorded exact provenance;
3. runs Bun 1.3.14 with frozen-lockfile, production, and ignore-scripts
   semantics;
4. verifies npm integrity, Git commit, or contained local digest and then the
   complete materialization digest and package root;
5. discovers roots, selects the recorded Extension, and verifies its identity;
6. reads active state itself and performs intrinsic validation and complete
   active-registry validation;
7. acquires the lifecycle lock, rechecks collisions, publishes managed bytes,
   syncs every published file and managed containing directory, and atomically
   rewrites the generic record document;
8. cleans staging and later removes any unreferenced inert materialization.

Neither operation may follow symlinks outside its immutable base, invoke
dependency lifecycle scripts, use ambient credentials, or accept an unpinned
source as replay authority.

Managed file sync is mandatory. Directory handles are synced through the
portable Node/Bun filesystem API where the host supports directory sync. Known
unsupported-directory errors are tolerated because that API exposes no
cross-platform stronger fallback; every other sync error aborts before the
record switch. Existing same-digest trees pass the same revalidation and sync
barrier before a new record may reference them.
If record parent-directory sync fails after rename, the store raises a typed
post-rename durability error. The installer reports that error but treats the
record as potentially committed for cleanup, retaining both old and new
materializations so either crash-visible record remains loadable.
The directory-sync port returns `synced | unsupported`; an unsupported record
parent result is tolerated but suppresses unreferenced-materialization
collection for the mutation.

### Sanitized Bun lock contract

The lock artifact is produced and consumed only by the generic installer. It is
stored inside the Catalog snapshot under a normalized content-addressed relative
path and is covered by `sha256` and `byteLength` bounds.

Sanitization and validation reject:

- credentials, tokens, authentication headers, secret query data, or URL
  userinfo other than the exact password-free `git` user for SSH Git;
- absolute host paths, home-directory paths, traversal, or symlink escapes;
- mutable Git refs or an npm resolution lacking exact version and integrity;
- file dependencies outside the immutable snapshot;
- unsupported workspace, link, patch, or protocol forms;
- a lockfile not generated for and replayable by pinned Bun 1.3.14.

Replay writes the exact bytes as `bun.lock`, derives a minimal staging
`package.json` from the recorded exact source, and executes a frozen install.
Tests inspect the subprocess arguments and environment to prove no ambient auth
or mutable resolution is used. `requestedTarget` is sanitized explanatory
provenance only; exact fields and the lock are replay authority.

### Package and literal snapshot entries

The generated schema-v2 snapshot uses a shared replay payload:

```ts
type GeneratedCatalogEntry =
  | {
      kind: "package";
      id: string;
      summary: string;
      replay: ReplayPayload;
    }
  | {
      kind: "literal";
      id: string;
      summary: string;
      authorPackage: ReplayPayload;
      locator: LiteralReplayLocator;
    };
```

For a package entry, build calls `resolveForAuthoring` with
`{ kind: "extension", extensionId }` and stores the returned replay payload.

For literal entries, build derives the package's single declared ctxindex entry
module and calls `resolveForAuthoring` with
`{ kind: "catalog", module, catalogId? }` against the author package as an exact
contained package. The installer materializes it, imports only that declared
module, and returns the selected (or sole) Catalog root; build can then enumerate literal
extensions and record module, Catalog id, zero-based entry index, and Extension
id. Its local source is the immutable snapshot root, normally `.`, and never the
author's absolute checkout path. All literal entries from the same author
package may reference the same content-addressed lock artifact and replay
payload.

At install, `installExact` receives the `catalog-entry` selection, replays the author package, imports the recorded
module, chooses the recorded Catalog id and entry index, verifies the Extension
id, and uses that root for validation. It publishes the entire replayed author
package as the managed execution materialization so relative imports and
dependencies remain available offline.

Literal locator mismatch, reordered entry with a different id, undeclared module,
or digest mismatch fails before publication.

### Deterministic generation and inert lifecycle

Build requires explicit author trust before resolving the author package,
running Bun, or importing a module. It accumulates all entries, rejects duplicate
ids within a Catalog, sorts canonical output, deduplicates identical artifacts
by digest, and atomically replaces the output only after all candidates pass.

Snapshot validation is closed and bounded. It validates exact source fields,
artifact paths/digests/sizes, locator bounds, containment, uniqueness, and total
manifest/artifact limits without opening packages or importing modules.

Add, refresh, list, show, Marketplace search, and default Catalog parsing call
only inert schema/storage code. Tests inject a throwing installer/import/package
runner to prove those paths cannot acquire or execute anything.

Add and refresh stage acquisition outside the generic lifecycle lock. Refresh
publishes only if the complete configured record it originally observed remains
current under the lock, so the first concurrent refresh to commit wins. A
refresh that resolves the same commit preserves `snapshot_acquired_at`; a
changed commit records the current acquisition time.

### Generic execution record with optional curation

The installed document remains one strict atomically rewritten generic store:

```ts
interface GenericInstalledExtensionRecord {
  id: string;
  source: ExactExtensionSource;
  materializationDigest: string;
  packageRoot: string;
  installedAt: number;
  updatedAt: number;
  curation?: CatalogCuration;
}
```

There is exactly one record per managed stable id. Catalog install supplies
`curation`; direct install omits it. No second Catalog installation store,
generation directory, active pointer, or history is created.

The commit sequence under the lifecycle lock is:

1. re-read the generic document and active builtin/explicit-path registry;
2. enforce the collision policy;
3. publish the already validated immutable materialization;
4. write the entire next strict document to a sibling temporary file;
5. sync the file, rename over the prior document, and sync its parent directory;
6. release the lock and perform retryable orphan cleanup.

Until step 5 succeeds, the prior record remains authoritative. Bytes published
before a failed rename are inert because startup has no record pointing to them.
The store never guesses, repairs, or scans for an alternate record on startup.

Strict document-level corruption fails managed loading closed. A valid document
whose individual materialization is missing or invalid degrades that Extension
without fetch and reports the record/path error.

### Collision, replacement, uninstall, and Catalog removal

For selected stable id `id`, Catalog install is permitted only if:

- no active builtin, explicit-path Extension, or generic installed record uses
  `id`; or
- the generic record has curation whose configured Catalog name and Catalog id
  exactly equal the selected Catalog.

The second case atomically replaces the same Catalog's prior commit/source. If
all replay and curation fields already match, it is idempotent. A direct record,
another Catalog's record, builtin, or explicit-path Extension returns a stable
conflict with uninstall-first guidance. Direct install/update likewise cannot
replace a curated record.

Uninstall removes the origin-neutral generic record and referenced managed bytes
under the same lock. Catalog removal checks generic records and is blocked while
any `curation.catalogName` references the configured Catalog.

### Catalog service and CLI composition

Marketplace search projects stored snapshot rows only. Matching is
case-insensitive over id and summary; duplicate ids across Catalogs are retained;
ordering is stable by normalized id, configured Catalog name, Catalog id, and
source locator. Stored/offline output includes acquisition age.

Catalog install requires a positional configured Catalog name and stable Extension id. The service
checks `--trust` before default refresh or any file/execution acquisition,
refreshes only the selected Catalog unless `--no-refresh`, resolves exactly one
entry, loads contained replay bytes, and calls `installExact`. Its pre-commit
callback runs under the lifecycle lock and revalidates the selected Catalog
identity, repository, ref, commit, acquisition time, and exact indexed entry.
It performs no acquisition or retry while the lock is held.

CLI behavior stays explicit and thin:

- `ctxindex extensions catalog build ...`
- `ctxindex extensions catalog add|refresh|list|show|remove ...`
- `ctxindex extensions search ... [--no-refresh]`
- `ctxindex extensions install <catalog> <id> --trust [--no-refresh]`
- existing explicit direct npm, Git, and local install/update forms
- origin-neutral `ctxindex extensions uninstall <id>`

Versioned Catalog selectors remain invalid. Human and JSON output report Catalog
name/id, commit, source kind, exact pin/locator, install/update time, and offline
snapshot age where applicable.

## Storage and State

- Configured Catalog records keep repository policy and the independently
  refreshed selected commit.
- Stored snapshots contain schema-v2 JSON plus bounded content-addressed lock
  artifacts; all paths are relative to state or snapshot roots.
- Generic installed records contain exact execution provenance and optional
  Catalog curation in one atomic document.
- Managed materializations are addressed by canonical digest and contain the
  complete runnable package root needed for offline startup.
- No absolute temporary/build paths, credentials, generation pointers, or
  Catalog-specific execution records are persisted.

## Security and Compatibility

- Build trust covers author-package acquisition, Bun execution, and module
  import. Repository-add trust and install execution trust remain separate.
- Install trust is checked before refresh, snapshot/artifact acquisition, Bun,
  import, or publication.
- Git uses hardened non-interactive credential-free policy. Replay metadata
  accepts SSH with no user or the exact `git` user and rejects passwords or
  other users; npm and Git exact provenance is verified; local and literal paths
  are contained.
- Bun scripts are disabled. Unknown lock formats and unsafe dependency forms fail
  closed.
- Catalog read paths and startup have no package-manager or network capability.
- This pre-alpha change replaces draft schema/state directly and adds no
  migration or compatibility alias.

## Verification

- SDK inference, exact-surface, copy-compatibility, and dependency-boundary tests.
- Failing-first resolver tests for npm, Git, contained local, literal author
  packages, exact selection, intrinsic validation, cleanup, and no publication.
- Lock sanitizer/replay tests for deterministic bytes, pinned Bun arguments,
  frozen replay, digest/integrity/commit checks, containment, credential
  rejection, no scripts, and upstream mutable-source advancement.
- Snapshot schema tests for canonical output, artifact bounds/deduplication,
  closed fields, versionless identity, literal locator bounds, and relocation.
- Inertness tests proving add/refresh/list/show/search/startup never call Bun,
  import, installer, or network acquisition.
- Install tests for complete-registry validation, literal locator replay, offline
  managed publication, same-Catalog replacement, idempotency, all uninstall-first
  collisions, interruption before record rename, orphan cleanup, and strict
  record degradation.
- CLI parser/command/formatter and compiled relocation workflow tests.
- Focused gates per slice, then `bun run ci`,
  `bunx openspec validate --all --strict`, `openspec-verify-change`, and affected
  codemap/SYSTEM refreshes.

## Promotion Notes

After implementation is verified, promote only durable ownership and interface
doctrine: canonical installer ownership, inert Catalog read paths, exact lock
replay, one generic record with optional curation, and same-Catalog-only
replacement. Keep task sequencing and implementation detail in this change.
