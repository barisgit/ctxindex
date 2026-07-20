import { join } from 'node:path'
import {
  createExtensionHostDiagnostic,
  safeExtensionDiagnostic,
} from '../extension/diagnostics'
import { importExtensionPackageRoot } from '../extension/import'
import { dataDir } from '../paths'
import {
  buildCompleteCandidateRegistry,
  type ExtensionRegistry,
  type OAuthAppIdentity,
} from '../registry'
import { acquireCatalogSnapshot } from './git'
import { catalogSnapshotPath, validateCatalogSnapshot } from './paths'
import { validateCatalogRef, validateCatalogRepository } from './repository'
import type {
  CatalogManifest,
  CatalogRecord,
  InstalledExtensionRecord,
} from './schema'
import { validateCatalogName } from './schema'
import { CatalogStore } from './store'

function invalid(message: string): never {
  throw createExtensionHostDiagnostic(message, { code: 'invalid_args' })
}

function conflict(message: string): never {
  throw createExtensionHostDiagnostic(message, { code: 'invalid_args' })
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
    catalog_name: input.manifest.catalog.name,
    ...(input.manifest.catalog.summary === undefined
      ? {}
      : { summary: input.manifest.catalog.summary }),
    extensions: input.manifest.extensions.map((entry) => ({
      id: entry.id,
      version: entry.version,
      source_path: entry.source.path,
      ...(entry.setup === undefined ? {} : { setup_path: entry.setup.path }),
    })),
  }
}

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

  constructor(options: CatalogServiceOptions = {}) {
    this.store = new CatalogStore({
      ...(options.configRoot === undefined
        ? {}
        : { configRoot: options.configRoot }),
    })
    this.dataRoot = options.dataRoot ?? dataDir()
    this.now = options.now ?? Date.now
  }

  async list(
    options: CatalogReadOptions = {},
  ): Promise<readonly CatalogRecord[]> {
    if (options.refresh === true) {
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
    if (options.refresh === true) return this.refresh({ name })
    const record = (await this.store.readCatalogs()).find(
      (catalog) => catalog.name === name,
    )
    if (record === undefined) invalid(`Unknown Catalog ${name}`)
    return record
  }

  async showExtension(
    name: string,
    id: string,
    version: number,
    options: CatalogReadOptions = {},
  ): Promise<{
    readonly catalog: CatalogRecord
    readonly extension: CatalogRecord['extensions'][number]
  }> {
    const catalog = await this.show(name, options)
    const extension = catalog.extensions.find(
      (candidate) => candidate.id === id && candidate.version === version,
    )
    if (extension === undefined) {
      invalid(`Catalog ${name} does not contain ${id}@${version}`)
    }
    return { catalog, extension }
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
    const acquired = await acquireCatalogSnapshot({
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
    const duplicateId = existing.find(
      (catalog) => catalog.catalog_id === record.catalog_id,
    )
    if (duplicateId !== undefined) {
      conflict(
        `Catalog id ${record.catalog_id} is already registered as ${duplicateId.name}`,
      )
    }
    await this.store.writeCatalogs([...existing, record])
    return record
  }

  async refresh(input: { readonly name: string }): Promise<CatalogRecord> {
    const existing = await this.store.readCatalogs()
    const current = existing.find((catalog) => catalog.name === input.name)
    if (current === undefined) invalid(`Unknown Catalog ${input.name}`)
    const acquired = await acquireCatalogSnapshot({
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
    const duplicateId = existing.find(
      (catalog) =>
        catalog.name !== current.name &&
        catalog.catalog_id === replacement.catalog_id,
    )
    if (duplicateId !== undefined) {
      conflict(
        `Catalog id ${replacement.catalog_id} is already registered as ${duplicateId.name}`,
      )
    }
    await this.store.writeCatalogs(
      existing.map((catalog) =>
        catalog.name === current.name ? replacement : catalog,
      ),
    )
    return replacement
  }

  async remove(name: string): Promise<CatalogRecord> {
    const existing = await this.store.readCatalogs()
    const current = existing.find((catalog) => catalog.name === name)
    if (current === undefined) invalid(`Unknown Catalog ${name}`)
    const installed = await this.store.readInstalled()
    if (installed.some((extension) => extension.catalog_name === name)) {
      conflict(
        `Catalog ${name} cannot be removed while Extensions are still installed`,
      )
    }
    await this.store.writeCatalogs(
      existing.filter((catalog) => catalog.name !== name),
    )
    return current
  }

  async install(input: {
    readonly catalog: string
    readonly id: string
    readonly version: number
    readonly trust: boolean
    readonly registry: ExtensionRegistry
    readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
    readonly refresh?: boolean
    readonly replaceableCatalog?: {
      readonly catalog: string
      readonly commit: string
    }
  }): Promise<InstalledExtensionRecord> {
    if (input.trust !== true) invalid('Extension install requires --trust')
    const catalog = await this.show(input.catalog, {
      refresh: input.refresh === true,
    })
    const recordedEntry = catalog.extensions.find(
      (entry) => entry.id === input.id && entry.version === input.version,
    )
    if (recordedEntry === undefined) {
      invalid(
        `Catalog ${catalog.name} does not contain ${input.id}@${input.version}`,
      )
    }
    const snapshot = catalogSnapshotPath(
      this.dataRoot,
      catalog.name,
      catalog.commit,
    )
    const manifest = await validateCatalogSnapshot(snapshot)
    if (manifest.catalog.id !== catalog.catalog_id) {
      throw createExtensionHostDiagnostic(
        'Catalog snapshot identity does not match persisted record',
      )
    }
    const entry = manifest.extensions.find(
      (candidate) =>
        candidate.id === input.id && candidate.version === input.version,
    )
    if (
      entry === undefined ||
      entry.source.path !== recordedEntry.source_path ||
      entry.setup?.path !== recordedEntry.setup_path
    ) {
      throw createExtensionHostDiagnostic(
        'Catalog snapshot entry does not match persisted record',
      )
    }
    let selected: Awaited<ReturnType<typeof importExtensionPackageRoot>>
    try {
      selected = await importExtensionPackageRoot(
        join(snapshot, entry.source.path),
        entry.id,
        {
          origin: 'catalog',
          commit: catalog.commit,
        },
      )
    } catch (cause) {
      throw createExtensionHostDiagnostic(
        `Catalog Extension ${entry.id}: ${safeExtensionDiagnostic(
          cause,
          'package could not be loaded',
        )}`,
      )
    }
    const current = await this.store.readInstalled()
    const existing = current.find(
      (candidate) =>
        candidate.id === entry.id && candidate.version === entry.version,
    )
    const replacesLoadedCatalog =
      existing !== undefined &&
      input.replaceableCatalog?.catalog === existing.catalog_name &&
      input.replaceableCatalog.commit === existing.commit
    const runtimeDefinitions = input.registry
      .list()
      .filter(
        (candidate) => !replacesLoadedCatalog || candidate.id !== entry.id,
      )
    if (runtimeDefinitions.some((candidate) => candidate.id === entry.id)) {
      throw createExtensionHostDiagnostic(
        `Catalog Extension ${entry.id}: Extension definition conflict`,
      )
    }
    try {
      buildCompleteCandidateRegistry({
        roots: [
          ...runtimeDefinitions.map((runtimeDefinition, index) => ({
            definition: runtimeDefinition,
            provenance: {
              origin: 'builtin' as const,
              entry: `runtime:${index}`,
              exportName: 'default',
            },
          })),
          selected,
        ],
        localOAuthAppIdentities: input.localOAuthAppIdentities,
      })
    } catch (cause) {
      throw createExtensionHostDiagnostic(
        `Catalog Extension ${entry.id}: ${safeExtensionDiagnostic(
          cause,
          'definition validation failed',
        )}`,
      )
    }
    const installed: InstalledExtensionRecord = {
      id: entry.id,
      version: entry.version,
      catalog_name: catalog.name,
      catalog_id: catalog.catalog_id,
      repository: catalog.repository,
      commit: catalog.commit,
      snapshot_acquired_at: catalog.snapshot_acquired_at,
      source_path: entry.source.path,
      ...(entry.setup === undefined ? {} : { setup_path: entry.setup.path }),
    }
    if (
      existing !== undefined &&
      JSON.stringify(existing) === JSON.stringify(installed)
    ) {
      return existing
    }
    await this.store.writeInstalled([
      ...current.filter(
        (candidate) =>
          candidate.id !== installed.id ||
          candidate.version !== installed.version,
      ),
      installed,
    ])
    return installed
  }

  async uninstall(input: {
    readonly id: string
    readonly version: number
  }): Promise<InstalledExtensionRecord> {
    const current = await this.store.readInstalled()
    const installed = current.find(
      (candidate) =>
        candidate.id === input.id && candidate.version === input.version,
    )
    if (installed === undefined) {
      invalid(`Extension ${input.id}@${input.version} is not installed`)
    }
    await this.store.writeInstalled(
      current.filter(
        (candidate) =>
          candidate.id !== input.id || candidate.version !== input.version,
      ),
    )
    return installed
  }
}
