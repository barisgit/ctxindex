import type {
  ExecuteSearchResult,
  SearchOutputFormat,
  SearchResult,
} from '@ctxindex/core/search'
import { formatSearchResults } from '@ctxindex/core/search'

function metadataFor(result: SearchResult): Record<string, unknown> {
  if (result.uri.startsWith('file://')) {
    const path = decodeURIComponent(new URL(result.uri).pathname)
    const lastDot = path.lastIndexOf('.')
    return {
      path,
      extension: lastDot >= 0 ? path.slice(lastDot + 1) : null,
    }
  }
  return {}
}

function agentJson(results: SearchResult[]): string {
  return JSON.stringify(
    results.map((result) => ({
      ref: result.uri,
      itemId: result.itemId,
      kind: result.kind,
      title: result.title,
      source: {
        id: result.sourceId,
        adapterId: result.adapterId,
      },
      metadata: metadataFor(result),
      score: result.score,
      deletedAt: result.deletedAt,
      snippets: result.bestChunk ? [result.bestChunk.snippet] : [],
      matchedFrom: result.matchedFrom,
    })),
    null,
    2,
  )
}

export function formatSearch(
  result: ExecuteSearchResult,
  opts: {
    readonly json: boolean
    readonly explain: boolean
    readonly format: SearchOutputFormat
  },
): string {
  if (opts.json && opts.format !== 'legacy') return agentJson(result.results)
  if (opts.json) return JSON.stringify(result.results, null, 2)
  return formatSearchResults(result.results, opts)
}
