import type { ExtensionLoadProvenance } from '@ctxindex/core/extension'
import { compareReferences } from '@ctxindex/core/registry'

type ProvenanceWithAge = ExtensionLoadProvenance & {
  readonly snapshotAgeMs?: number
}

function provenanceText(provenance: ProvenanceWithAge): string {
  if (provenance.kind === 'builtin') return 'builtin'
  if (provenance.kind === 'path') return `path ${provenance.path}`
  return `catalog ${provenance.catalog} ${provenance.commit} ${provenance.repository} ${provenance.sourcePath}${provenance.snapshotAgeMs === undefined ? '' : ` age ${provenance.snapshotAgeMs}ms`}`
}

export function formatExtensions(
  registry: {
    list(): readonly {
      id: string
      version: number
      profiles: readonly { id: string; version: number }[]
      adapters: readonly { id: string; version: number }[]
      docs?: { readonly summary: string }
    }[]
  },
  jsonOutput: boolean,
  provenance: readonly ExtensionLoadProvenance[] = [],
  now = Date.now(),
): string {
  const provenanceByIdentity = new Map(
    provenance.map((item) => [
      `${item.id}@${item.version}`,
      item.kind === 'catalog'
        ? {
            ...item,
            snapshotAgeMs: Math.max(0, now - item.snapshotAcquiredAt),
          }
        : item,
    ]),
  )
  const extensions = [...registry.list()]
    .sort(compareReferences)
    .map((extension) => {
      const source = provenanceByIdentity.get(
        `${extension.id}@${extension.version}`,
      )
      return {
        id: extension.id,
        version: extension.version,
        ...(extension.docs?.summary === undefined
          ? {}
          : { summary: extension.docs.summary }),
        profiles: [...extension.profiles]
          .sort(compareReferences)
          .map(({ id, version }) => ({ id, version })),
        adapters: [...extension.adapters]
          .sort(compareReferences)
          .map(({ id, version }) => ({ id, version })),
        ...(source === undefined ? {} : { provenance: source }),
      }
    })
  if (jsonOutput) return JSON.stringify(extensions, null, 2)
  return extensions
    .map(
      (extension) =>
        `${extension.id}@${extension.version}${extension.summary ? `\t${extension.summary}` : ''}\tProfiles: ${extension.profiles.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}\tAdapters: ${extension.adapters.map((item) => `${item.id}@${item.version}`).join(', ') || 'none'}${extension.provenance === undefined ? '' : `\tProvenance: ${provenanceText(extension.provenance)}`}`,
    )
    .join('\n')
}
