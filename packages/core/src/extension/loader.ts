import { join, resolve } from 'node:path'
import type { AnyExtensionDefinition } from '@ctxindex/extension-sdk'
import {
  catalogSnapshotPath,
  type InstalledExtensionRecord,
  validateCatalogSnapshot,
} from '../catalog'
import type { CtxindexConfig } from '../config'
import { dataDir } from '../paths'
import { createExtensionRegistry, type ExtensionRegistry } from '../registry'
import { importExtensionDefinition } from './import'

export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: readonly AnyExtensionDefinition[]
  readonly installed?: readonly InstalledExtensionRecord[]
  readonly dataRoot?: string
}

export type ExtensionLoadProvenance =
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'builtin'
    }
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'path'
      readonly path: string
    }
  | {
      readonly id: string
      readonly version: number
      readonly kind: 'catalog'
      readonly catalog: string
      readonly catalogId: string
      readonly repository: string
      readonly commit: string
      readonly sourcePath: string
    }

export interface LoadExtensionsResult {
  readonly registry: ExtensionRegistry
  readonly diagnostics: readonly ExtensionLoadDiagnostic[]
  readonly provenance: readonly ExtensionLoadProvenance[]
}

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult> {
  if (!Array.isArray(input.builtins)) {
    throw new TypeError(
      'loadExtensions requires an explicit complete builtins list',
    )
  }
  const registry = createExtensionRegistry(input.builtins)
  const diagnostics: ExtensionLoadDiagnostic[] = []
  const provenance: ExtensionLoadProvenance[] = input.builtins.map(
    ({ id, version }) => ({ id, version, kind: 'builtin' }),
  )

  for (const configuredPath of input.config.extensions.paths) {
    const extensionPath = resolve(configuredPath)
    try {
      const definition = await importExtensionDefinition(extensionPath)
      registry.register(definition)
      provenance.push({
        id: definition.id,
        version: definition.version,
        kind: 'path',
        path: extensionPath,
      })
    } catch (cause) {
      diagnostics.push({
        path: extensionPath,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  for (const installed of input.installed ?? []) {
    const snapshot = catalogSnapshotPath(
      input.dataRoot ?? dataDir(),
      installed.catalog_name,
      installed.commit,
    )
    const extensionPath = join(snapshot, installed.source_path)
    try {
      const manifest = await validateCatalogSnapshot(snapshot)
      if (manifest.catalog.id !== installed.catalog_id) {
        throw new TypeError(
          'Installed Catalog identity does not match snapshot manifest',
        )
      }
      const entry = manifest.extensions.find(
        (candidate) =>
          candidate.id === installed.id &&
          candidate.version === installed.version &&
          candidate.source.path === installed.source_path,
      )
      if (entry === undefined) {
        throw new TypeError(
          'Installed Extension provenance does not match snapshot manifest',
        )
      }
      const definition = await importExtensionDefinition(extensionPath)
      if (
        definition.id !== installed.id ||
        definition.version !== installed.version
      ) {
        throw new TypeError(
          `Installed Extension identity mismatch: expected ${installed.id}@${installed.version}, loaded ${definition.id}@${definition.version}`,
        )
      }
      registry.register(definition)
      provenance.push({
        id: definition.id,
        version: definition.version,
        kind: 'catalog',
        catalog: installed.catalog_name,
        catalogId: installed.catalog_id,
        repository: installed.repository,
        commit: installed.commit,
        sourcePath: installed.source_path,
      })
    } catch (cause) {
      diagnostics.push({
        path: extensionPath,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  return { registry, diagnostics, provenance }
}
