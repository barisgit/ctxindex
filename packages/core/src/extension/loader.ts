import { join, resolve } from 'node:path'
import {
  catalogSnapshotPath,
  type InstalledExtensionRecord,
  validateCatalogSnapshot,
} from '../catalog'
import type { CtxindexConfig } from '../config'
import {
  type DirectExtensionInstallationRecord,
  directExtensionMaterializationPath,
  hashDirectory,
  projectDirectExtensionRecord,
} from '../direct-extension'
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
  readonly directInstalled?: readonly DirectExtensionInstallationRecord[]
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
  | {
      readonly id: string
      readonly kind: 'direct'
      readonly sourceKind: DirectExtensionInstallationRecord['source']['kind']
      readonly requestedTarget: string
      readonly resolvedIdentity: string
      readonly materializationDigest: string
      readonly installedAt: number
      readonly updatedAt: number
    }

export interface LoadExtensionsResult {
  readonly roots: readonly CollectedExtension[]
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

  for (const installed of input.directInstalled ?? []) {
    const materialization = directExtensionMaterializationPath(
      input.dataRoot ?? dataDir(),
      installed.materialization_digest,
    )
    const extensionPath = join(materialization, installed.package_root)
    try {
      if (
        (await hashDirectory(materialization)) !==
        installed.materialization_digest
      ) {
        throw new TypeError(
          'Direct Extension materialization integrity mismatch',
        )
      }
      const selected = await importExtensionPackageRoot(
        extensionPath,
        installed.id,
        {
          origin: 'direct',
          ...(installed.source.kind === 'npm'
            ? {
                packageVersion: installed.source.exact_version,
                ...(installed.source.integrity === undefined
                  ? {}
                  : { integrity: installed.source.integrity }),
              }
            : installed.source.kind === 'git'
              ? { commit: installed.source.commit }
              : {}),
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
      const projected = projectDirectExtensionRecord(installed)
      provenance.push({
        id: installed.id,
        kind: 'direct',
        sourceKind: installed.source.kind,
        requestedTarget: installed.source.requested_target,
        resolvedIdentity: projected.resolvedIdentity,
        materializationDigest: installed.materialization_digest,
        installedAt: installed.installed_at,
        updatedAt: installed.updated_at,
      })
    } catch (cause) {
      diagnostics.push({
        path: `direct:${installed.id}`,
        message: safeExtensionDiagnostic(
          cause,
          'Direct Extension package could not be loaded',
        ),
      })
    }
  }

  return {
    roots: activeRoots,
    registry,
    completeRegistry,
    diagnostics,
    provenance,
    documentation: createDocumentationProjection(activeRoots),
  }
}
