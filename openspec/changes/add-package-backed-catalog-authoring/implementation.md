## Capability Implementation Targets

- `extension-catalogs` -> `openspec/specs/extension-catalogs/implementation.md`
- `extension-installation` -> `openspec/specs/extension-installation/implementation.md`
- `extension-loading` -> `openspec/specs/extension-loading/implementation.md`
- `cli-surface` -> `openspec/specs/cli-surface/implementation.md`

## Module Ownership

`@ctxindex/extension-sdk` owns only pure Catalog authoring definitions and
factories. It imports/re-exports the same inert npm/Git/local target value shape
consumed by direct installation and performs no resolution or I/O.

Provider-neutral Catalog core owns generated snapshot schemas, strict configured
Catalog and curation-link records, Catalog Git snapshot acquisition, authoring
orchestration, data-only Marketplace projection, and Catalog-specific state
transitions. It does not own package-manager invocation, target resolution,
dependency materialization, immutable package storage, locking, garbage
collection, module collection, exact Extension selection, or complete-registry
validation.

The canonical generic Extension installation service owns those execution
concerns for direct and Catalog callers. Catalog core injects that service and
passes either an authoring target to resolve or a snapshot resolution to
reproduce. The common Extension loader/collector owns `ctxindex.extensions`
module resolution and versionless root selection.

The CLI owns only closed grammar, usage validation, service composition,
deterministic formatting, typed-error mapping, and exit codes. Built-in Adapter
packages remain independent of Catalog and installation core.

## Interfaces and Data Flow

### Pure Catalog authoring values

```ts
// Imported from the generic installation contract; shown here only as a use.
export type ExtensionPackageTarget =
  | { readonly kind: 'npm'; readonly target: string }
  | { readonly kind: 'git'; readonly target: string }
  | { readonly kind: 'local'; readonly target: string }

export interface PackageExtensionDescriptor<
  TTarget extends ExtensionPackageTarget = ExtensionPackageTarget,
  TExtensionId extends string = string,
> {
  readonly kind: 'package-extension'
  readonly source: TTarget
  readonly extensionId: TExtensionId
}

export type CatalogEntry =
  | AnyExtensionDefinition
  | PackageExtensionDescriptor

export interface CatalogDefinition<
  TId extends string = string,
  TEntries extends readonly CatalogEntry[] = readonly CatalogEntry[],
> {
  readonly kind: 'catalog'
  readonly id: TId
  readonly label: string
  readonly summary?: string
  readonly extensions: TEntries
}

export function packageExtension<
  const TTarget extends ExtensionPackageTarget,
  const TExtensionId extends string,
>(
  source: TTarget,
  extensionId: TExtensionId,
): PackageExtensionDescriptor<TTarget, TExtensionId>;

export function defineCatalog<
  const TId extends string,
  const TEntries extends readonly CatalogEntry[],
>(
  definition: CatalogDefinition<TId, TEntries>,
): CatalogDefinition<TId, TEntries>;
```

The implementation consumes the final generic target type from
`extension-installation`; it must not retain the duplicate illustrative alias
above. Factories validate local object shape only. Runtime schemas revalidate
their output; branding or physical SDK identity is not an authorization seam.

### Package entry discovery

```ts
export type CtxindexPackageRoot =
  | AnyExtensionDefinition
  | AnyCatalogDefinition

export interface CollectedCtxindexModule {
  readonly modulePath: string
  readonly roots: readonly CtxindexPackageRoot[]
}
```

The existing strict `package.json#ctxindex.extensions` resolver supplies module
paths. Generic namespace inspection collects recognized roots by discriminator,
rejects malformed recognized roots and duplicate ids, ignores unknown future
roots, and exposes no export-name selector. Normal runtime activation selects
only Extensions. Catalog authoring may select one Catalog id; a trusted literal
install then verifies its nested entry index and stable Extension id.

### Generated snapshot

```ts
export interface CatalogLiteralSource {
  readonly kind: 'literal'
  readonly module: string
  readonly catalogId: string
  readonly entryIndex: number
}

export interface CatalogDependencyResolutionArtifact {
  readonly format: string
  readonly path: string
  readonly digest: string
}

export interface CatalogNpmPackageResolution {
  readonly kind: 'npm'
  readonly requestedTarget: string
  readonly version: string
  readonly integrity: string
  readonly dependencyResolution: CatalogDependencyResolutionArtifact
  readonly materializationDigest: string
}

export interface CatalogGitPackageResolution {
  readonly kind: 'git'
  readonly requestedTarget: string
  readonly commit: string
  readonly dependencyResolution: CatalogDependencyResolutionArtifact
  readonly materializationDigest: string
}

export interface CatalogLocalPackageResolution {
  readonly kind: 'local'
  readonly path: string
  readonly contentDigest: string
  readonly dependencyResolution: CatalogDependencyResolutionArtifact
  readonly materializationDigest: string
}

export interface CatalogPackageSource {
  readonly kind: 'package'
  readonly resolution:
    | CatalogNpmPackageResolution
    | CatalogGitPackageResolution
    | CatalogLocalPackageResolution
}

export interface CatalogSnapshotEntry {
  readonly id: string
  readonly summary?: string
  readonly source: CatalogLiteralSource | CatalogPackageSource
}

export interface CatalogManifest {
  readonly schemaVersion: 2
  readonly catalog: {
    readonly id: string
    readonly label: string
    readonly summary?: string
  }
  readonly generated: {
    readonly packageName: string
    readonly packageVersion: string
    readonly module: string
  }
  readonly extensions: readonly CatalogSnapshotEntry[]
}
```

The final package source is composed from the canonical generic resolved
provenance schema rather than manually duplicating its validation. The generic
installer also emits a sanitized content-addressed exact dependency-resolution
artifact that authoring copies into a contained Catalog path; its format, digest,
and replay semantics remain installer-owned. Catalog adds only its closed
snapshot wrapper and contained-path constraints. Exact
required fields differ by source kind: npm retains exact version and required
integrity, Git retains exact commit, and local retains contained path plus content
digest; every kind retains the generic materialization digest.

### Generic installation dependency

Catalog authoring and install depend on, but do not own, these semantic
operations from the canonical generic installer:

```ts
export interface CatalogCurationProvenanceInput {
  readonly extensionId: string
  readonly catalogName: string
  readonly catalogId: string
  readonly repository: string
  readonly commit: string
  readonly snapshotAcquiredAt: number
  readonly sourceLocator: string
}

export interface GenericExtensionPackageInstaller {
  resolveForAuthoring(input: {
    readonly source: ExtensionPackageTarget
    readonly extensionId: string
    readonly baseRoot: string
  }): Promise<ResolvedExtensionCandidate>;

  installExact(input: {
    readonly expected: ResolvedExtensionProvenance
    readonly dependencyResolutionArtifact: Uint8Array
    readonly extensionId: string
    readonly immutableSnapshot?: ImmutableSnapshotHandle
    readonly curation?: CatalogCurationProvenanceInput
  }): Promise<GenericExtensionInstallationRecord>;

  installCollectedRoot(input: {
    readonly root: AnyExtensionDefinition
    readonly extensionId: string
    readonly immutableOrigin: GenericResolvedOrigin
    readonly curation?: CatalogCurationProvenanceInput
  }): Promise<GenericExtensionInstallationRecord>;
}
```

Names are reconciled to the implemented direct-install interface before runtime
work. The invariant is normative: these operations use the one target parser,
Bun materializer, staging root, lifecycle lock, immutable publisher, manifest
resolver, collectors, selector, validator, execution record, rollback, and
referenced-only cleanup. Catalog core neither wraps shell commands nor performs
source-kind-specific acquisition.

`installExact` accepts only the snapshot's exact source-specific provenance,
verified replay artifact, stable Extension id, and an immutable snapshot handle
when a contained local path requires it, plus optional separately typed exact
Catalog curation provenance. It does not accept an execution pin because the
installer derives that from its validated result. The installer itself acquires
into staging, resolves `ctxindex.extensions`, collects package roots, selects
the exact id, reads the active registry and local OAuth App identities, builds
the complete candidate, validates conflicts, constructs the curation link, and
transactionally publishes both members. Catalog callers cannot supply or
precompute a `CompleteRegistryInput` or execution record and cannot bypass any
validation stage. `installCollectedRoot` follows the same internally owned
active-state, complete-validation, and transaction path for literals.

Build emits the authoring trust notice before any generic package or import
effect, then selects the authored Catalog, maps literal entries to stable nested
locators, calls `resolveForAuthoring` for each package entry, copies only safe
resolved provenance and the generic replay artifact, validates the artifact
digest plus complete schema, canonicalizes entry order, and atomically writes
the output. A local target's `baseRoot` is the author
Catalog package root and must resolve to a contained directory.

Trusted install first validates persisted configured-Catalog state against the
exact snapshot. Literal install imports the exact pinned module, recollects the
Catalog id, checks the entry index/id, and calls `installCollectedRoot`. Package
install verifies the contained replay artifact and passes it with the snapshot's
exact generic provenance to `installExact`; mutable requested targets and
transitive dependency ranges are never independently re-resolved.

### Separate configured, curation, and execution state

```ts
export interface CatalogCurationLink {
  readonly extension_id: string
  readonly catalog_name: string
  readonly catalog_id: string
  readonly repository: string
  readonly commit: string
  readonly snapshot_acquired_at: number
  readonly source_locator: string
  readonly execution_materialization_digest: string
}
```

Configured Catalog records retain local name, repository/ref, exact current
commit, acquisition time, Catalog metadata, and inert entries. The generic
execution record remains owned by `extension-installation` and contains no
Catalog-shaped fields. The curation link joins them for inventory and lifecycle
guards without becoming a loading source of truth.

Execution and curation remain distinct typed records but activate as one durable
generation. Under the generic lifecycle lock, install writes an inactive
generation containing the validated generic execution record plus its optional
Catalog curation link and fsyncs the generation and parent directory. It then
writes and fsyncs a pointer candidate, atomically replaces the stable Extension
id's active-generation pointer, and fsyncs the pointer directory. Only that
directory fsync makes the activation commit durable and permits cleanup of the
prior generation. Startup reads only pointer-reachable generations, so an
interruption before the durable pointer commit retains whichever complete pair
the recovered pointer names and an interruption after it observes the complete
new pair. No intermediate state exposes a new execution record without its
curation link or vice versa.

Recovery under the same lock validates pointer targets, discards or reuses only
inactive unreferenced generations, and retains a prior pointer on any malformed
candidate. If interruption occurs between pointer rename and pointer-directory
fsync, both complete generations remain; recovery accepts whichever complete
generation the durable pointer names and treats the other as inactive. Cleanup
of superseded generations and unreferenced materializations happens only after
the directory fsync and is retryable; interruption can leak inert bytes but
cannot lose or split active state. Refresh changes only the configured Catalog
record. Missing or corrupt pointer-reachable state degrades without acquisition
or implicit relinking.

### Catalog service and CLI composition

Catalog list/search refresh all configured Catalogs in deterministic local-name
order only when requested; show/install refresh only the selected Catalog. CLI
defaults pass refresh enabled, while `--no-refresh` passes stored policy and
formatters derive snapshot age from an injected clock.

Catalog show/install use only stable Extension ids. Marketplace search matches
id/summary and returns every provenance row sorted by id, Catalog local name,
then exact source locator. CLI build/search adapters receive narrow service
interfaces and never parse snapshots or package-manager results.

## Storage and State

`catalogs.toml` advances to strict schema version 2 for configured inert Catalog
records. The generic installation store owns inactive activation-generation
documents and one atomically replaced active-generation pointer map. Each
generation stores separate execution and optional Catalog curation members; the
pointer, not either member alone, grants activation. The generic immutable
materialization tree remains where `extension-installation` owns it. Catalog code
adds no package root, staging directory, lock file, or garbage collector.

Catalog snapshots remain below `data/catalogs/<catalog-name>/<commit>` and carry
generic dependency-resolution artifacts in normalized content-addressed paths.
Catalog core transports and hashes those inert files but does not interpret their
installer-owned format. Absolute
snapshot and materialization paths are derived, never persisted. Local package
targets in generated snapshots are repository-relative and contained. Uninstall
and Catalog removal preserve snapshots and Source-owned data; materialization
cleanup delegates to the generic referenced-only lifecycle.

Generated resolution artifacts use bounded content-addressed paths such as
`ctxindex-resolutions/<digest>.json` beside the manifest. Authoring validates and
publishes reusable artifacts before using a sibling candidate file and existing
atomic-writer discipline to switch the manifest last. Canonical serialization
sorts object keys and entries deterministically. A byte-identical output is
unchanged; failed generation preserves the prior manifest, while an unreferenced
content-addressed artifact is inert and may be reused by a later generation.

## Security and Compatibility

Catalog Git acquisition retains hardened issue #23 policy and repository trust.
Catalog build and direct install/update invocations are their explicit author or
operator trust grants and emit warnings before package evaluation/import.
Catalog install checks its separate execution `--trust` before refresh,
materialization, import, or mutation. Generic package operations inherit the
direct installer's target credential rejection, safe provenance, explicit argv,
bounded process output/timeouts, pinned Bun policy, dependency handling,
immutable publication, digest verification, and redacted diagnostics.

Refresh/search/list/show/startup never invoke package management or import
Catalog/Extension modules. Snapshot requested targets are inert; exact resolved
provenance constrains trusted install. A Catalog cannot supply commands,
credentials, registry configuration, Provider auth, scopes, or hosts.

Both `add-git-extension-catalogs` and `add-direct-extension-installation` must be
archived and synced before this delta is implemented or later synced. The schema
and selector change is intentionally breaking before release.
Extension definition versions, `ctxindex.entries`, bespoke Catalog package
records, and any custom npm acquisition types receive no compatibility aliases.
Profiles remain versioned; Extensions are selected only by stable id.

## Verification

SDK tests cover inference, readonly mixed entries, exact public exports, all
three source kinds, stable ids, and effect-free factories. Package-entry tests
cover `ctxindex.extensions`, generic root inspection, malformed recognized roots,
unknown future roots, multi-Catalog selection, nested literal indices, and no
export-name persistence.

Authoring tests inject the generic installer. They cover npm/Git/contained-local
resolved provenance, exact replay-artifact transport, transitive range drift,
exact root selection, duplicate ids, no nested Catalogs,
canonical ordering, unchanged bytes, failed-output preservation, and proof that
Catalog code contains no registry/downloader/extractor/materialization store.

Catalog lifecycle tests cover strict schema v2, data-only refresh/search/list,
default/stored refresh order and age, duplicate Marketplace curation, exact pin
reproduction, literal nested selection, separate curation/execution records,
stable installed pins across refresh, atomic replacement, relocation, and
offline degraded startup. Shared installer tests remain the sole source of npm,
Git, local, dependency, locking, rollback, and garbage-collection behavior.

CLI tests cover build/search grammar, versionless selectors, default and
`--no-refresh` behavior, both trust gates, separate provenance rendering,
trust-before-effects, deterministic JSON, and thin delegation. Final gates are
focused tests, architecture/package-dependency/egress checks, compiled
Extension/Catalog relocation, `bun run ci`, strict all-OpenSpec validation,
cartography, system-reference refresh, and `openspec-verify-change`.

## Promotion Notes

- Promote pure Catalog factories, inert schema-v2 snapshots, configured/curation
  records, Marketplace projection, and no-acquisition discovery doctrine into
  `extension-catalogs/implementation.md`.
- Promote shared Catalog caller semantics without duplicated package behavior
  into `extension-installation/implementation.md`.
- Promote `ctxindex.extensions` Catalog root inspection, nested literal
  selection, generic offline execution, and separate provenance joins into
  `extension-loading/implementation.md`.
- Promote versionless build/search/show/install discriminants, refresh policy,
  trust ordering, and provenance formatting into `cli-surface/implementation.md`.
