import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CatalogCurationProvenanceInput,
  ExactExtensionInstallCandidate,
  GenericExtensionInstallationRecord,
} from '../direct-extension'
import { createExtensionHostDiagnostic } from '../extension/diagnostics'
import { catalogSnapshotPath, validateCatalogSnapshot } from './paths'
import type {
  CatalogManifestEntry,
  CatalogRecord,
  CatalogReplayPayload,
} from './schema'

function invalid(message: string): never {
  throw createExtensionHostDiagnostic(message, { code: 'invalid_args' })
}

function validationFailure(message: string): never {
  throw createExtensionHostDiagnostic(message, {
    code: 'extension_validation_failed',
  })
}

function catalogChanged(name: string): never {
  throw createExtensionHostDiagnostic(
    `Catalog ${name} changed before Extension installation committed`,
    { code: 'extension_conflict' },
  )
}

function exactCandidate(input: {
  readonly entry: CatalogManifestEntry
  readonly replay: CatalogReplayPayload
  readonly lockBytes: Uint8Array
  readonly immutableSnapshotRoot: string
}): ExactExtensionInstallCandidate {
  return {
    replay: input.replay,
    lockBytes: input.lockBytes,
    immutableSnapshotRoot: input.immutableSnapshotRoot,
    selection:
      input.entry.source.kind === 'literal'
        ? { kind: 'catalog-entry', ...input.entry.source.locator }
        : { kind: 'extension', extensionId: input.entry.id },
  }
}

function curation(input: {
  readonly catalog: CatalogRecord
  readonly entry: CatalogManifestEntry
  readonly entryIndex: number
}): CatalogCurationProvenanceInput {
  return {
    extensionId: input.entry.id,
    catalogName: input.catalog.name,
    catalogId: input.catalog.catalog_id,
    repository: input.catalog.repository,
    commit: input.catalog.commit,
    snapshotAcquiredAt: input.catalog.snapshot_acquired_at,
    sourceLocator:
      input.entry.source.kind === 'literal'
        ? { kind: 'literal', ...input.entry.source.locator }
        : { kind: 'package', entryIndex: input.entryIndex },
  }
}

export interface CatalogSelectionReader {
  show(
    name: string,
    options?: { readonly refresh?: boolean },
  ): Promise<CatalogRecord>
}

export interface ExactCatalogExtensionInstaller {
  installExact(
    input: ExactExtensionInstallCandidate & {
      readonly curation?: CatalogCurationProvenanceInput
      readonly validatePreCommit?: () => Promise<void>
      readonly signal?: AbortSignal
    },
  ): Promise<GenericExtensionInstallationRecord>
}

export interface CatalogInstallationServiceOptions {
  readonly catalogs: CatalogSelectionReader
  readonly installer: ExactCatalogExtensionInstaller
  readonly dataRoot: string
}

export class CatalogInstallationService {
  readonly catalogs: CatalogSelectionReader
  readonly installer: ExactCatalogExtensionInstaller
  readonly dataRoot: string

  constructor(options: CatalogInstallationServiceOptions) {
    this.catalogs = options.catalogs
    this.installer = options.installer
    this.dataRoot = options.dataRoot
  }

  async install(input: {
    readonly catalog: string
    readonly extensionId: string
    readonly trust: boolean
    readonly noRefresh?: boolean
    readonly signal?: AbortSignal
  }): Promise<GenericExtensionInstallationRecord> {
    if (input.trust !== true) invalid('Extension install requires --trust')
    const catalog = await this.catalogs.show(input.catalog, {
      refresh: input.noRefresh !== true,
    })
    const entryIndex = catalog.extensions.findIndex(
      (entry) => entry.id === input.extensionId,
    )
    const recordedEntry = catalog.extensions[entryIndex]
    if (recordedEntry === undefined) {
      invalid(`Catalog ${catalog.name} does not contain ${input.extensionId}`)
    }
    const snapshot = catalogSnapshotPath(
      this.dataRoot,
      catalog.name,
      catalog.commit,
    )
    const manifest = await validateCatalogSnapshot(snapshot)
    const snapshotEntry = manifest.extensions[entryIndex]
    if (
      manifest.catalog.id !== catalog.catalog_id ||
      snapshotEntry === undefined ||
      snapshotEntry.id !== input.extensionId ||
      JSON.stringify(snapshotEntry) !== JSON.stringify(recordedEntry)
    ) {
      validationFailure('Catalog snapshot does not match configured state')
    }
    const replay =
      snapshotEntry.source.kind === 'literal'
        ? snapshotEntry.source.authorPackage
        : snapshotEntry.source.replay
    const lockBytes = new Uint8Array(
      await readFile(join(snapshot, replay.lock.path)),
    )
    return this.installer.installExact({
      ...exactCandidate({
        entry: snapshotEntry,
        replay,
        lockBytes,
        immutableSnapshotRoot: snapshot,
      }),
      curation: curation({
        catalog,
        entry: snapshotEntry,
        entryIndex,
      }),
      validatePreCommit: async () => {
        let configured: CatalogRecord
        try {
          configured = await this.catalogs.show(catalog.name, {
            refresh: false,
          })
        } catch (cause) {
          if ((cause as { readonly code?: unknown }).code !== 'invalid_args')
            throw cause
          catalogChanged(catalog.name)
        }
        if (configured.catalog_id !== catalog.catalog_id)
          catalogChanged(catalog.name)
      },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
  }
}
