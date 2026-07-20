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

Acquisition uses isolated temporary bare Git storage, resolves one full ref or exact OID to a commit, archives committed objects, validates the complete candidate snapshot, and publishes it by atomic rename. A concurrent publisher of the same valid target is accepted after target validation; unrelated filesystem errors remain failures. Git executes without terminal prompts, credential helpers, hooks, filters, submodules, or external protocol helpers. Public HTTPS repositories exclude userinfo, query, fragment, localhost, and literal loopback, IPv4-mapped, private, unique-local, link-local, site-local, unspecified, or multicast destinations; persisted acquisition inputs are revalidated at the Git boundary. Snapshot and record writes fail without changing the previously visible pin or installed provenance.

Configured Catalog records and generic installed-extension records persist in
their respective stores. Catalog records include the exact snapshot acquisition
time as portable provenance; absolute snapshot paths are always derived from the
active data root. Explicit refresh and refresh-enabled reads change only the
Catalog pin, while `refresh: false` uses stored inert state. The canonical
installer publishes managed bytes and atomically rewrites one stable-id generic
record containing exact source provenance and optional Catalog curation. Only a
record curated by the same configured Catalog name and Catalog id is replaceable;
direct, other-Catalog, built-in, and explicit-path identity conflicts fail before
persistence. Origin-neutral uninstall is owned by the generic direct lifecycle,
and Catalog removal checks those same records under the lifecycle lock while
retaining snapshots and all Source/Resource storage.

## Verification

Focused core tests cover closed schemas, size/count/path bounds, symlink containment, strict TOML, repository/ref policy, committed-object snapshots, concurrent publication, add/refresh atomicity, unique Catalog IDs, independent installed pins, runtime-complete identity validation, idempotence, removal guards, timestamped age provenance, and snapshot retention. CLI and compiled relocation tests use absolute local Git fixtures only.
