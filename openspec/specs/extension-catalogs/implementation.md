# Extension Catalogs Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements are introduced by the active `add-git-extension-catalogs` delta and will live in this capability's `spec.md` after archive.

## Interfaces

### @ctxindex/core — manifest and provenance records

```ts
export type CatalogManifestEntry = z.infer<typeof catalogManifestEntrySchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>
export type CatalogRecord = z.infer<typeof catalogRecordSchema>
export type InstalledExtensionRecord = z.infer<
  typeof installedExtensionRecordSchema
>
```

### @ctxindex/core — Catalog service

```ts
export interface CatalogServiceOptions {
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly now?: () => number
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
    version: number,
    options?: CatalogReadOptions,
  ): Promise<{
    readonly catalog: CatalogRecord
    readonly extension: CatalogRecord['extensions'][number]
  }>;
  add(input: {
    readonly name: string
    readonly repository: string
    readonly ref: string
    readonly trust: boolean
  }): Promise<CatalogRecord>;
  refresh(input: { readonly name: string }): Promise<CatalogRecord>;
  remove(name: string): Promise<CatalogRecord>;
  install(input: {
    readonly catalog: string
    readonly id: string
    readonly version: number
    readonly trust: boolean
    readonly registry: ExtensionRegistry
    readonly refresh?: boolean
    readonly replaceableCatalog?: {
      readonly catalog: string
      readonly commit: string
    }
  }): Promise<InstalledExtensionRecord>;
  uninstall(input: {
    readonly id: string
    readonly version: number
  }): Promise<InstalledExtensionRecord>;
}
```

### @ctxindex/core — portable storage and acquisition

```ts
export interface CatalogStoreOptions {
  readonly configRoot?: string
}

export class CatalogStore {
  readonly catalogsPath: string
  readonly installedPath: string
  constructor(options?: CatalogStoreOptions);
  readCatalogs(): Promise<readonly CatalogRecord[]>;
  writeCatalogs(records: readonly CatalogRecord[]): Promise<void>;
  readInstalled(): Promise<readonly InstalledExtensionRecord[]>;
  writeInstalled(
    records: readonly InstalledExtensionRecord[],
  ): Promise<void>;
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

`@ctxindex/core/catalog` is the sole owner of Catalog repository policy, system-Git acquisition, strict manifest and TOML schemas, portable snapshot derivation, and Catalog/install state transitions. CLI modules depend on this service; Catalog core never depends on CLI or provider Adapters.

Acquisition uses isolated temporary bare Git storage, resolves one full ref or exact OID to a commit, archives committed objects, validates the complete candidate snapshot, and publishes it by atomic rename. A concurrent publisher of the same valid target is accepted after target validation; unrelated filesystem errors remain failures. Git executes without terminal prompts, credential helpers, hooks, filters, submodules, or external protocol helpers. Public HTTPS repositories exclude userinfo, query, fragment, localhost, and literal loopback, IPv4-mapped, private, unique-local, link-local, site-local, unspecified, or multicast destinations; persisted acquisition inputs are revalidated at the Git boundary. Snapshot and record writes fail without changing the previously visible pin or installed provenance.

Catalog and installed records persist separately. Their stored fields include the exact snapshot acquisition time as portable provenance; absolute snapshot paths are always derived from the active data root. Explicit refresh and refresh-enabled read/install calls change the Catalog pin only, while `refresh: false` uses stored state. Install validates an atomic candidate replacement against the runtime-complete registry through the shared Extension import and registry seam before switching one `(id, version)` installed record. Only an exact previously loaded Catalog provenance is replaceable; built-in and explicit-path identity conflicts fail before persistence. Metadata removal retains snapshots and all Source/Resource storage.

## Verification

Focused core tests cover closed schemas, size/count/path bounds, symlink containment, strict TOML, repository/ref policy, committed-object snapshots, concurrent publication, add/refresh atomicity, unique Catalog IDs, independent installed pins, runtime-complete identity validation, idempotence, removal guards, timestamped age provenance, and snapshot retention. CLI and compiled relocation tests use absolute local Git fixtures only.
