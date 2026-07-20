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
  return `catalog ${provenance.catalog} ${provenance.commit} ${provenance.repository} ${provenance.sourcePath}${provenance.snapshotAgeMs === undefined ? '' : ` age ${provenance.snapshotAgeMs}ms`}`
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
  directInventory: readonly DirectExtensionInventoryEntry[] = [],
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
  const directById = new Map(directInventory.map((item) => [item.id, item]))
  const extensions = [
    ...registry.list(),
    ...directInventory
      .filter(({ id }) => !loadedIds.has(id))
      .map(({ id }) => ({ id, profiles: [], adapters: [] })),
  ]
    .sort((left, right) => compareStrings(left.id, right.id))
    .map((extension) => {
      const storedDirect = directById.get(extension.id)
      const loadedSource = provenanceByIdentity.get(extension.id)
      const source =
        storedDirect === undefined
          ? loadedSource
          : {
              id: storedDirect.id,
              kind: 'direct' as const,
              sourceKind: storedDirect.sourceKind,
              requestedTarget: storedDirect.requestedTarget,
              resolvedIdentity: storedDirect.resolvedIdentity,
              materializationDigest: storedDirect.materializationDigest,
              installedAt: storedDirect.installedAt,
              updatedAt: storedDirect.updatedAt,
            }
      return {
        id: extension.id,
        ...(storedDirect !== undefined && !loadedIds.has(extension.id)
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
