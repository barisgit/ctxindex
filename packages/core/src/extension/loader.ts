import { join, resolve } from 'node:path'
import {
  catalogSnapshotPath,
  type InstalledExtensionRecord,
  validateCatalogSnapshot,
} from '../catalog'
import type { CtxindexConfig } from '../config'
import { dataDir } from '../paths'
import { createExtensionRegistry, type ExtensionRegistry } from '../registry'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  type CompleteRegistry,
  type OAuthAppIdentity,
} from '../registry/complete-registry'
import { collectExtensionExports, type DefinitionModule } from './collector'
import { safeExtensionDiagnostic } from './diagnostics'
import {
  assertCompatibleExtensionDocumentation,
  createDocumentationProjection,
  type DocumentationProjection,
  resolveCollectedExtensionDocumentation,
} from './documentation'
import {
  importExtensionPackageRoot,
  importExtensionPackageRoots,
} from './import'

export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: DefinitionModule
  readonly installed?: readonly InstalledExtensionRecord[]
  readonly localOAuthAppIdentities?: readonly OAuthAppIdentity[]
  readonly dataRoot?: string
}

export type ExtensionLoadProvenance =
  | {
      readonly id: string
      readonly kind: 'builtin'
    }
  | {
      readonly id: string
      readonly kind: 'path'
      readonly path: string
    }
  | {
      readonly id: string
      readonly kind: 'catalog'
      readonly catalog: string
      readonly catalogId: string
      readonly repository: string
      readonly commit: string
      readonly snapshotAcquiredAt: number
      readonly sourcePath: string
    }

export interface LoadExtensionsResult {
  readonly registry: ExtensionRegistry
  readonly completeRegistry: CompleteRegistry
  readonly diagnostics: readonly ExtensionLoadDiagnostic[]
  readonly provenance: readonly ExtensionLoadProvenance[]
  readonly documentation: DocumentationProjection
}

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult> {
  if (
    input.builtins === null ||
    typeof input.builtins !== 'object' ||
    Array.isArray(input.builtins)
  ) {
    throw new TypeError(
      'loadExtensions requires an explicit built-in module namespace',
    )
  }
  let activeRoots: readonly CollectedExtension[] = await Promise.all(
    collectExtensionExports(input.builtins, 'builtin:@ctxindex/adapters', {
      origin: 'builtin',
      packageName: '@ctxindex/adapters',
    }).map((root) => resolveCollectedExtensionDocumentation(root)),
  )
  assertCompatibleExtensionDocumentation(activeRoots)
  const localOAuthAppIdentities = input.localOAuthAppIdentities ?? []
  let completeRegistry = buildCompleteCandidateRegistry({
    roots: activeRoots,
    localOAuthAppIdentities,
  })
  let registry = createExtensionRegistry(
    activeRoots.map(({ definition }) => definition),
  )
  const diagnostics: ExtensionLoadDiagnostic[] = []
  const provenance: ExtensionLoadProvenance[] = activeRoots.map(
    ({ definition }) => ({
      id: definition.id,
      kind: 'builtin',
    }),
  )

  for (const configuredPath of input.config.extensions.paths) {
    const extensionPath = resolve(configuredPath)
    try {
      const roots = await importExtensionPackageRoots(extensionPath)
      const nextRoots = [...activeRoots, ...roots]
      assertCompatibleExtensionDocumentation(nextRoots)
      const candidate = buildCompleteCandidateRegistry({
        roots: nextRoots,
        localOAuthAppIdentities,
      })
      registry = createExtensionRegistry(
        nextRoots.map(({ definition }) => definition),
      )
      activeRoots = nextRoots
      completeRegistry = candidate
      provenance.push(
        ...roots.map(({ definition }) => ({
          id: definition.id,
          kind: 'path' as const,
          path: extensionPath,
        })),
      )
    } catch (cause) {
      diagnostics.push({
        path: extensionPath,
        message: safeExtensionDiagnostic(
          cause,
          'Extension package could not be loaded',
        ),
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
          candidate.source.path === installed.source_path,
      )
      if (entry === undefined) {
        throw new TypeError(
          'Installed Extension provenance does not match snapshot manifest',
        )
      }
      const selected = await importExtensionPackageRoot(
        extensionPath,
        installed.id,
        {
          origin: 'catalog',
          commit: installed.commit,
        },
      )
      const nextRoots = [...activeRoots, selected]
      assertCompatibleExtensionDocumentation(nextRoots)
      const candidate = buildCompleteCandidateRegistry({
        roots: nextRoots,
        localOAuthAppIdentities,
      })
      registry = createExtensionRegistry(
        nextRoots.map(({ definition }) => definition),
      )
      activeRoots = nextRoots
      completeRegistry = candidate
      provenance.push({
        id: selected.definition.id,
        kind: 'catalog',
        catalog: installed.catalog_name,
        catalogId: installed.catalog_id,
        repository: installed.repository,
        commit: installed.commit,
        snapshotAcquiredAt: installed.snapshot_acquired_at,
        sourcePath: installed.source_path,
      })
    } catch (cause) {
      diagnostics.push({
        path: extensionPath,
        message: safeExtensionDiagnostic(
          cause,
          'Catalog Extension package could not be loaded',
        ),
      })
    }
  }

  return {
    registry,
    completeRegistry,
    diagnostics,
    provenance,
    documentation: createDocumentationProjection(activeRoots),
  }
}
