import type { ExtensionLoadProvenance } from '@ctxindex/core/extension'
import { compareReferences, compareStrings } from '@ctxindex/core/registry'

type ProvenanceWithAge = ExtensionLoadProvenance & {
  readonly snapshotAgeMs?: number
}

function provenanceText(provenance: ProvenanceWithAge): string {
  if (provenance.kind === 'builtin') return 'builtin'
  if (provenance.kind === 'path') return `path ${provenance.path}`
  if (provenance.kind === 'direct') {
    return `direct ${provenance.sourceKind} ${provenance.requestedTarget} ${provenance.resolvedIdentity} ${provenance.materializationDigest}`
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
  const extensions = [...registry.list()]
    .sort((left, right) => compareStrings(left.id, right.id))
    .map((extension) => {
      const source = provenanceByIdentity.get(extension.id)
      return {
        id: extension.id,
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
        `${extension.id}\tProfiles: ${extension.profiles.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}\tAdapters: ${extension.adapters.map((item) => item.id).join(', ') || 'none'}${extension.provenance === undefined ? '' : `\tProvenance: ${provenanceText(extension.provenance)}`}`,
    )
    .join('\n')
}
