import type { DirectExtensionInventoryEntry } from '@ctxindex/core'
import type { ExtensionLoadProvenance } from '@ctxindex/core/extension'
import { compareReferences, compareStrings } from '@ctxindex/core/registry'

type ProvenanceWithAge = ExtensionLoadProvenance & {
  readonly snapshotAgeMs?: number
}

function provenanceText(provenance: ProvenanceWithAge): string {
  if (provenance.kind === 'builtin') return 'builtin'
  if (provenance.kind === 'path') return `path ${provenance.path}`
  if (provenance.kind === 'direct') {
    return `direct ${provenance.sourceKind} ${provenance.requestedTarget} ${provenance.resolvedIdentity} ${provenance.materializationDigest} installed ${provenance.installedAt} updated ${provenance.updatedAt}`
  }
  return `catalog ${provenance.catalog} ${provenance.catalogId} ${provenance.commit} ${provenance.repository} ${JSON.stringify(provenance.sourceLocator)}${provenance.snapshotAgeMs === undefined ? '' : ` age ${provenance.snapshotAgeMs}ms`} source ${provenance.sourceKind} ${provenance.requestedTarget} ${provenance.resolvedIdentity} ${provenance.materializationDigest} installed ${provenance.installedAt} updated ${provenance.updatedAt}`
}

export function formatExtensions(
  registry: {
    list(): readonly {
      id: string
      profiles: readonly { id: string; version: number }[]
      adapters: readonly { id: string }[]
    }[]
  },
  jsonOutput: boolean,
  provenance: readonly ExtensionLoadProvenance[] = [],
  installedInventory: readonly DirectExtensionInventoryEntry[] = [],
  now = Date.now(),
): string {
  const provenanceByIdentity = new Map(
    provenance.map((item) => [
      item.id,
      item.kind === 'catalog'
        ? {
            ...item,
            snapshotAgeMs: Math.max(0, now - item.snapshotAcquiredAt),
          }
        : item,
    ]),
  )
  const loadedIds = new Set(registry.list().map(({ id }) => id))
  const installedById = new Map(
    installedInventory.map((item) => [item.id, item]),
  )
  const extensions = [
    ...registry.list(),
    ...installedInventory
      .filter(({ id }) => !loadedIds.has(id))
      .map(({ id }) => ({ id, profiles: [], adapters: [] })),
  ]
    .sort((left, right) => compareStrings(left.id, right.id))
    .map((extension) => {
      const storedInstalled = installedById.get(extension.id)
      const loadedSource = provenanceByIdentity.get(extension.id)
      const loadedInstalled =
        loadedSource?.kind === 'direct' || loadedSource?.kind === 'catalog'
          ? loadedSource
          : undefined
      const storedSource =
        storedInstalled?.curation === undefined
          ? storedInstalled === undefined
            ? undefined
            : {
                id: storedInstalled.id,
                kind: 'direct' as const,
                sourceKind: storedInstalled.sourceKind,
                requestedTarget: storedInstalled.requestedTarget,
                resolvedIdentity: storedInstalled.resolvedIdentity,
                materializationDigest: storedInstalled.materializationDigest,
                installedAt: storedInstalled.installedAt,
                updatedAt: storedInstalled.updatedAt,
              }
          : {
              id: storedInstalled.id,
              kind: 'catalog' as const,
              catalog: storedInstalled.curation.catalog_name,
              catalogId: storedInstalled.curation.catalog_id,
              repository: storedInstalled.curation.repository,
              commit: storedInstalled.curation.commit,
              snapshotAcquiredAt: storedInstalled.curation.snapshot_acquired_at,
              snapshotAgeMs: Math.max(
                0,
                now - storedInstalled.curation.snapshot_acquired_at,
              ),
              sourceLocator: storedInstalled.curation.source_locator,
              sourceKind: storedInstalled.sourceKind,
              requestedTarget: storedInstalled.requestedTarget,
              resolvedIdentity: storedInstalled.resolvedIdentity,
              materializationDigest: storedInstalled.materializationDigest,
              installedAt: storedInstalled.installedAt,
              updatedAt: storedInstalled.updatedAt,
            }
      const source =
        storedInstalled === undefined
          ? loadedSource
          : (loadedInstalled ?? storedSource)
      return {
        id: extension.id,
        ...(storedInstalled !== undefined && loadedInstalled === undefined
          ? { available: false as const }
          : {}),
        profiles: [...extension.profiles]
          .sort(compareReferences)
          .map(({ id, version }) => ({ id, version })),
        adapters: [...extension.adapters]
          .sort((left, right) => compareStrings(left.id, right.id))
          .map(({ id }) => ({ id })),
        ...(source === undefined ? {} : { provenance: source }),
      }
    })
  if (jsonOutput) return JSON.stringify(extensions, null, 2)
  return extensions
    .map(
      (extension) =>
        `${extension.id}${extension.available === false ? '\tUnavailable' : ''}\tProfiles: ${extension.profiles.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}\tAdapters: ${extension.adapters.map((item) => item.id).join(', ') || 'none'}${extension.provenance === undefined ? '' : `\tProvenance: ${provenanceText(extension.provenance)}`}`,
    )
    .join('\n')
}
