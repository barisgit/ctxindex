import type { GenericExtensionInstallationRecord } from '../direct-extension/schema'
import { DirectExtensionStore } from '../direct-extension/store'
import { createExtensionHostDiagnostic } from '../extension/diagnostics'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { configDir, dataDir } from '../paths'
import { acquireCatalogSnapshot } from './git'
import { type MarketplaceExtension, searchMarketplace } from './marketplace'
import { validateCatalogRef, validateCatalogRepository } from './repository'
import type { CatalogManifest, CatalogRecord } from './schema'
import { validateCatalogName } from './schema'
import { CatalogStore } from './store'

function invalid(message: string): never {
  throw createExtensionHostDiagnostic(message, { code: 'invalid_args' })
}

function conflict(message: string): never {
  throw createExtensionHostDiagnostic(message, {
    code: 'extension_conflict',
  })
}

function recordFromManifest(input: {
  readonly name: string
  readonly repository: string
  readonly ref: string
  readonly commit: string
  readonly snapshotAcquiredAt: number
  readonly manifest: CatalogManifest
}): CatalogRecord {
  return {
    name: input.name,
    repository: input.repository,
    ref: input.ref,
    commit: input.commit,
    snapshot_acquired_at: input.snapshotAcquiredAt,
    catalog_id: input.manifest.catalog.id,
    catalog_label: input.manifest.catalog.label,
    ...(input.manifest.catalog.summary === undefined
      ? {}
      : { summary: input.manifest.catalog.summary }),
    generated: input.manifest.generated,
    extensions: input.manifest.extensions,
  }
}

export interface CatalogInstallationRecordReader {
  withLifecycleLock<T>(operation: () => Promise<T>): Promise<T>
  readRecords(): Promise<
    readonly Pick<GenericExtensionInstallationRecord, 'id' | 'curation'>[]
  >
}

export interface CatalogServiceOptions {
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly now?: () => number
  readonly installationRecords?: CatalogInstallationRecordReader
  readonly acquireSnapshot?: typeof acquireCatalogSnapshot
}

export interface CatalogReadOptions {
  readonly refresh?: boolean
}

export class CatalogService {
  readonly store: CatalogStore
  readonly dataRoot: string
  readonly now: () => number
  readonly installationRecords: CatalogInstallationRecordReader
  readonly acquireSnapshot: NonNullable<
    CatalogServiceOptions['acquireSnapshot']
  >

  constructor(options: CatalogServiceOptions = {}) {
    const configRoot = options.configRoot ?? configDir()
    const dataRoot = options.dataRoot ?? dataDir()
    this.store = new CatalogStore({ configRoot })
    this.dataRoot = dataRoot
    this.now = options.now ?? Date.now
    this.installationRecords =
      options.installationRecords ??
      new DirectExtensionStore({ configRoot, dataRoot })
    this.acquireSnapshot = options.acquireSnapshot ?? acquireCatalogSnapshot
  }

  async list(
    options: CatalogReadOptions = {},
  ): Promise<readonly CatalogRecord[]> {
    if (options.refresh !== false) {
      for (const catalog of await this.store.readCatalogs()) {
        await this.refresh({ name: catalog.name })
      }
    }
    return this.store.readCatalogs()
  }

  async show(
    name: string,
    options: CatalogReadOptions = {},
  ): Promise<CatalogRecord> {
    if (options.refresh !== false) return this.refresh({ name })
    const record = (await this.store.readCatalogs()).find(
      (catalog) => catalog.name === name,
    )
    if (record === undefined) invalid(`Unknown Catalog ${name}`)
    return record
  }

  async showExtension(
    name: string,
    id: string,
    options: CatalogReadOptions = {},
  ): Promise<{
    readonly catalog: CatalogRecord
    readonly extension: CatalogRecord['extensions'][number]
  }> {
    const catalog = await this.show(name, options)
    const extension = catalog.extensions.find(
      (candidate) => candidate.id === id,
    )
    if (extension === undefined) {
      invalid(`Catalog ${name} does not contain ${id}`)
    }
    return { catalog, extension }
  }

  async search(
    query?: string,
    options: CatalogReadOptions = {},
  ): Promise<readonly MarketplaceExtension[]> {
    return searchMarketplace(await this.list(options), query, this.now())
  }

  async add(input: {
    readonly name: string
    readonly repository: string
    readonly ref: string
    readonly trust: boolean
  }): Promise<CatalogRecord> {
    if (input.trust !== true) invalid('Catalog add requires --trust')
    const name = validateCatalogName(input.name)
    const repository = validateCatalogRepository(input.repository)
    const ref = validateCatalogRef(input.ref)
    const existing = await this.store.readCatalogs()
    if (existing.some((catalog) => catalog.name === name)) {
      conflict(`Catalog ${name} is already registered`)
    }
    const acquired = await this.acquireSnapshot({
      repository,
      ref,
      name,
      dataRoot: this.dataRoot,
    })
    const record = recordFromManifest({
      name,
      repository,
      ref,
      commit: acquired.commit,
      snapshotAcquiredAt: this.now(),
      manifest: acquired.manifest,
    })
    return this.installationRecords.withLifecycleLock(async () => {
      const current = await this.store.readCatalogs()
      if (current.some((catalog) => catalog.name === name)) {
        conflict(`Catalog ${name} is already registered`)
      }
      const duplicateId = current.find(
        (catalog) => catalog.catalog_id === record.catalog_id,
      )
      if (duplicateId !== undefined) {
        conflict(
          `Catalog id ${record.catalog_id} is already registered as ${duplicateId.name}`,
        )
      }
      await this.store.writeCatalogs([...current, record])
      return record
    })
  }

  async refresh(input: { readonly name: string }): Promise<CatalogRecord> {
    const existing = await this.store.readCatalogs()
    const current = existing.find((catalog) => catalog.name === input.name)
    if (current === undefined) invalid(`Unknown Catalog ${input.name}`)
    const acquired = await this.acquireSnapshot({
      repository: validateCatalogRepository(current.repository),
      ref: validateCatalogRef(current.ref),
      name: validateCatalogName(current.name),
      dataRoot: this.dataRoot,
    })
    const replacement = recordFromManifest({
      name: current.name,
      repository: current.repository,
      ref: current.ref,
      commit: acquired.commit,
      snapshotAcquiredAt: this.now(),
      manifest: acquired.manifest,
    })
    return this.installationRecords.withLifecycleLock(async () => {
      const latest = await this.store.readCatalogs()
      const configured = latest.find((catalog) => catalog.name === input.name)
      if (configured === undefined) invalid(`Unknown Catalog ${input.name}`)
      if (JSON.stringify(configured) !== JSON.stringify(current)) {
        conflict(`Catalog ${input.name} changed during refresh; retry`)
      }
      if (replacement.catalog_id !== configured.catalog_id) {
        conflict(
          `Catalog ${input.name} changed stable id from ${configured.catalog_id} to ${replacement.catalog_id}`,
        )
      }
      const duplicateId = latest.find(
        (catalog) =>
          catalog.name !== configured.name &&
          catalog.catalog_id === replacement.catalog_id,
      )
      if (duplicateId !== undefined) {
        conflict(
          `Catalog id ${replacement.catalog_id} is already registered as ${duplicateId.name}`,
        )
      }
      await this.store.writeCatalogs(
        latest.map((catalog) =>
          catalog.name === configured.name ? replacement : catalog,
        ),
      )
      return replacement
    })
  }

  async remove(name: string): Promise<CatalogRecord> {
    return this.installationRecords.withLifecycleLock(async () => {
      const existing = await this.store.readCatalogs()
      const current = existing.find((catalog) => catalog.name === name)
      if (current === undefined) invalid(`Unknown Catalog ${name}`)
      const blockingIds = (await this.installationRecords.readRecords())
        .filter((record) => record.curation?.catalog_name === name)
        .map((record) => record.id)
        .sort(compareUnicodeCodePoints)
      if (blockingIds.length > 0) {
        conflict(
          `Catalog ${name} cannot be removed while Extensions are installed: ${blockingIds.join(', ')}`,
        )
      }
      await this.store.writeCatalogs(
        existing.filter((catalog) => catalog.name !== name),
      )
      return current
    })
  }
}
