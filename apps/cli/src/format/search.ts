import type { ExecuteSearchResult } from '@ctxindex/core/search'
import { formatSearchResults } from '@ctxindex/core/search'

export function formatSearch(
  result: ExecuteSearchResult,
  opts: { readonly json: boolean; readonly explain: boolean },
): string {
  if (opts.json) return JSON.stringify(result.results, null, 2)
  return formatSearchResults(result.results, opts)
}
