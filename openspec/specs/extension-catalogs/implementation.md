# Extension Catalogs Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level,
> not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

### @ctxindex/core — manifest and provenance records

```ts
export type CatalogManifestEntry = z.infer<typeof catalogManifestEntrySchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>
export type CatalogRecord = z.infer<typeof catalogRecordSchema>
export type GenericExtensionInstallationRecord =
  DirectExtensionInstallationRecord
```

### @ctxindex/core — Catalog service

```ts
export interface CatalogServiceOptions {
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly now?: () => number
  readonly installationRecords?: CatalogInstallationRecordReader
}

export interface CatalogReadOptions {
  readonly refresh?: boolean
}

export class CatalogService {
  readonly store: CatalogStore
  readonly dataRoot: string
  readonly now: () => number
  constructor(options?: CatalogServiceOptions);
  list(options?: CatalogReadOptions): Promise<readonly CatalogRecord[]>;
  show(name: string, options?: CatalogReadOptions): Promise<CatalogRecord>;
  showExtension(
    name: string,
    id: string,
    options?: CatalogReadOptions,
  ): Promise<{
    readonly catalog: CatalogRecord
    readonly extension: CatalogRecord['extensions'][number]
  }>;
  search(
    query?: string,
    options?: CatalogReadOptions,
  ): Promise<readonly MarketplaceExtension[]>;
  add(input: {
    readonly name: string
    readonly repository: string
    readonly ref: string
    readonly trust: boolean
  }): Promise<CatalogRecord>;
  refresh(input: { readonly name: string }): Promise<CatalogRecord>;
  remove(name: string): Promise<CatalogRecord>;
}

export class CatalogInstallationService {
  install(input: {
    readonly catalog: string
    readonly extensionId: string
    readonly trust: boolean
    readonly noRefresh?: boolean
    readonly signal?: AbortSignal
  }): Promise<GenericExtensionInstallationRecord>;
}
```

### @ctxindex/core — portable storage and acquisition

```ts
export interface CatalogStoreOptions {
  readonly configRoot?: string
}

export class CatalogStore {
  readonly catalogsPath: string
  constructor(options?: CatalogStoreOptions);
  readCatalogs(): Promise<readonly CatalogRecord[]>;
  writeCatalogs(records: readonly CatalogRecord[]): Promise<void>;
}

export interface AcquiredCatalogSnapshot {
  readonly commit: string
  readonly path: string
  readonly manifest: CatalogManifest
}

export function acquireCatalogSnapshot(input: {
  readonly repository: string
  readonly ref: string
  readonly name: string
  readonly dataRoot: string
}): Promise<AcquiredCatalogSnapshot>;
```

## Implementation doctrine

`@ctxindex/core/catalog` owns Catalog repository policy, system-Git acquisition,
strict manifest and TOML schemas, portable snapshot derivation, inert lifecycle,
and Marketplace projection. `CatalogInstallationService` selects one exact
versionless entry from validated stored state, then delegates replay, selection,
runtime-complete validation, publication, collision policy, and record writing
to the canonical generic installer. CLI modules depend on these services;
Catalog core never depends on CLI or provider Adapters.

Acquisition is implemented with isolated temporary bare Git storage, exact-commit
object archival, complete-candidate validation, and atomic snapshot publication.
Repository inputs are revalidated at the system-Git boundary, whose environment
and command configuration suppress ambient Git integration. The authoritative
repository policy and acquisition outcomes are specified by
[Explicit trusted Catalog acquisition](spec.md#requirement-explicit-trusted-catalog-acquisition)
and
[Hardened Git execution and repository policy](spec.md#requirement-hardened-git-execution-and-repository-policy).

Configured Catalog records and generic installed-extension records use separate
stores, while absolute snapshot paths are derived from the active data root.
Catalog lifecycle commits and generic record publication coordinate through the
canonical installation lifecycle lock. The generic record is the single
execution record and may carry Catalog curation beside exact source provenance;
origin-neutral uninstall remains owned by the generic direct lifecycle. The
Catalog service stages acquisition outside the lock. Refresh commits only when
the complete originally observed Catalog record remains current, preserves the
acquisition timestamp for an unchanged commit, and records `now` for a changed
commit. Catalog installation likewise stages exact replay outside the lock and
revalidates the selected snapshot plus exact indexed entry before publication.
Git replay schemas accept credential-free SSH with no user or the exact `git`
user and reject passwords or other users. The
authoritative refresh, collision, replacement, removal, and retention rules are
specified by
[Independent pin refresh and installed provenance](spec.md#requirement-independent-pin-refresh-and-installed-provenance)
and
[Safe removal, uninstall, and retained state](spec.md#requirement-safe-removal-uninstall-and-retained-state).

## Verification

Focused core tests cover closed schemas, size/count/path bounds, symlink containment, strict TOML, repository/ref policy, committed-object snapshots, concurrent publication, add/refresh atomicity, unique Catalog IDs, independent installed pins, runtime-complete identity validation, idempotence, removal guards, timestamped age provenance, and snapshot retention. CLI and compiled relocation tests use absolute local Git fixtures only.
