import type { SourceRow } from '@ctxindex/core/source'

export function formatSourceAdded(sourceId: string): string {
  return `source added: ${sourceId}`
}

export function formatSourceRemoved(sourceId: string): string {
  return `source removed: ${sourceId}`
}

export function formatSources(
  sources: SourceRow[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) return JSON.stringify(sources, null, 2)
  return sources
    .map((source) => `${source.id}\t${source.adapter_id}`)
    .join('\n')
}
