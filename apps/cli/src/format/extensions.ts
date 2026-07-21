import type { DirectExtensionInventoryEntry } from '@ctxindex/core'
import type { ExtensionLoadProvenance } from '@ctxindex/core/extension'
import { compareReferences, compareStrings } from '@ctxindex/core/registry'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

export function formatExtensions(
  registry: {
    list(): readonly {
      id: string
      profiles: readonly { id: string; version: number }[]
      adapters: readonly { id: string }[]
    }[]
  },
  format: OutputFormat,
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
  if (format === 'json') return compactJson(extensions)
  const rows = extensions.map((extension) => ({
    id: extension.id,
    available: extension.available !== false,
    profiles: compactJson(extension.profiles),
    adapters: compactJson(extension.adapters),
    provenance:
      extension.provenance === undefined
        ? 'null'
        : compactJson(extension.provenance),
  }))
  const columns = [
    { key: 'id', label: 'Extension' },
    { key: 'available', label: 'Available' },
    { key: 'profiles', label: 'Profiles' },
    { key: 'adapters', label: 'Adapters' },
    { key: 'provenance', label: 'Provenance' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, rows)
    : formatTsv(columns, rows)
}
