import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CtxindexConfig } from '../config'
import {
  type CatalogCurationLink,
  directExtensionMaterializationPath,
  type GenericExtensionInstallationRecord,
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
import {
  createExtensionHostDiagnostic,
  safeExtensionDiagnostic,
} from './diagnostics'
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
import {
  inspectPackageEntries,
  resolvePackageEntries,
  selectCatalogLiteral,
  selectExactCatalog,
} from './package-entry'

export interface ExtensionLoadDiagnostic {
  readonly path: string
  readonly message: string
}

export interface LoadExtensionsInput {
  readonly config: CtxindexConfig
  readonly builtins: DefinitionModule
  readonly installed?: readonly GenericExtensionInstallationRecord[]
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
      readonly sourceLocator: CatalogCurationLink['source_locator']
      readonly sourceKind: GenericExtensionInstallationRecord['source']['kind']
      readonly requestedTarget: string
      readonly resolvedIdentity: string
      readonly materializationDigest: string
      readonly installedAt: number
      readonly updatedAt: number
    }
  | {
      readonly id: string
      readonly kind: 'direct'
      readonly sourceKind: GenericExtensionInstallationRecord['source']['kind']
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

async function importInstalledExtension(
  extensionPath: string,
  installed: GenericExtensionInstallationRecord,
): Promise<CollectedExtension> {
  const provenance =
    installed.curation === undefined
      ? {
          origin: 'direct' as const,
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
        }
      : { origin: 'catalog' as const, commit: installed.curation.commit }
  const locator = installed.curation?.source_locator
  if (locator?.kind !== 'literal') {
    return importExtensionPackageRoot(extensionPath, installed.id, provenance)
  }

  const manifest = JSON.parse(
    await readFile(join(extensionPath, 'package.json'), 'utf8'),
  )
  const catalog = selectExactCatalog(
    await inspectPackageEntries(
      await resolvePackageEntries(extensionPath, manifest, provenance),
    ),
    locator.catalogId,
  )
  if (
    (await realpath(resolve(extensionPath, locator.module))) !==
    (await realpath(catalog.modulePath))
  ) {
    throw createExtensionHostDiagnostic(
      'Catalog literal module does not match exact locator',
    )
  }
  const definition = selectCatalogLiteral(
    catalog.definition,
    locator.entryIndex,
    locator.extensionId,
  )
  return resolveCollectedExtensionDocumentation(
    {
      definition,
      provenance: {
        ...provenance,
        entry: catalog.modulePath,
        exportName: 'default',
      },
    },
    pathToFileURL(catalog.modulePath),
  )
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
      const selected = await importInstalledExtension(extensionPath, installed)
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
      const exactSource = {
        sourceKind: installed.source.kind,
        requestedTarget: installed.source.requested_target,
        resolvedIdentity: projected.resolvedIdentity,
        materializationDigest: installed.materialization_digest,
        installedAt: installed.installed_at,
        updatedAt: installed.updated_at,
      }
      provenance.push(
        installed.curation === undefined
          ? { id: installed.id, kind: 'direct', ...exactSource }
          : {
              id: installed.id,
              kind: 'catalog',
              catalog: installed.curation.catalog_name,
              catalogId: installed.curation.catalog_id,
              repository: installed.curation.repository,
              commit: installed.curation.commit,
              snapshotAcquiredAt: installed.curation.snapshot_acquired_at,
              sourceLocator: installed.curation.source_locator,
              ...exactSource,
            },
      )
    } catch (cause) {
      diagnostics.push({
        path: `installed:${installed.id}`,
        message: safeExtensionDiagnostic(
          cause,
          'Installed Extension package could not be loaded',
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
