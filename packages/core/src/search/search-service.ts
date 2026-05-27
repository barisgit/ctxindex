import { CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type { CtxindexDatabase } from '../storage'
import { search } from './search'
import type { ExplainInfo, SearchFilters, SearchResult } from './types'

export interface SearchServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
}

export interface ExecuteSearchInput {
  readonly query: string
  readonly realmSlug?: string
  readonly providerFilter?: string
  readonly sourceFilter?: string
  readonly mimeFilter?: string
  readonly since?: number | string | Date
  readonly until?: number | string | Date
  readonly includeDeleted?: boolean
  readonly limit?: number
  readonly explain?: boolean
  readonly output?: 'text' | 'json'
}

export interface ExplainRow extends ExplainInfo {
  readonly itemId: string
}

export interface ExecuteSearchResult {
  readonly results: SearchResult[]
  readonly explain?: ExplainRow[]
}

export interface FormatSearchResultsOptions {
  readonly json?: boolean
  readonly explain?: boolean
}

export interface SearchService {
  executeSearch(input: ExecuteSearchInput): ExecuteSearchResult
}

function parseSince(since: ExecuteSearchInput['since']): number | undefined {
  if (since === undefined) return undefined
  if (typeof since === 'number') {
    if (Number.isFinite(since)) return since
    throw new CtxindexValidationError('invalid_filter', 'invalid since filter')
  }
  if (since instanceof Date) {
    const value = since.getTime()
    if (Number.isFinite(value)) return value
    throw new CtxindexValidationError('invalid_filter', 'invalid since filter')
  }
  const value = Date.parse(since)
  if (Number.isNaN(value)) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `invalid since filter: ${since}`,
    )
  }
  return value
}

function buildFilters(input: ExecuteSearchInput): SearchFilters {
  const filters: SearchFilters = {}
  if (input.realmSlug) filters.realms = [input.realmSlug]
  if (input.providerFilter) filters.adapters = [input.providerFilter]
  if (input.sourceFilter) filters.sources = [input.sourceFilter]
  if (input.mimeFilter) filters.kinds = [input.mimeFilter]
  const since = parseSince(input.since)
  if (since !== undefined) filters.since = since
  const until = parseSince(input.until)
  if (until !== undefined) filters.until = until
  if (input.includeDeleted === true) filters.includeDeleted = true
  return filters
}

function explainRows(results: SearchResult[]): ExplainRow[] {
  return results.flatMap((result) =>
    result.explain ? [{ itemId: result.itemId, ...result.explain }] : [],
  )
}

export function createSearchService(deps: SearchServiceDeps): SearchService {
  return {
    executeSearch(input: ExecuteSearchInput): ExecuteSearchResult {
      const limit = input.limit ?? 20
      if (!Number.isInteger(limit) || limit < 1) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid search limit: ${input.limit}`,
        )
      }

      const results = search(deps.db, {
        query: input.query,
        filters: buildFilters(input),
        limit,
        explain: input.explain === true,
      })
      deps.logger.debug(
        { count: results.length, explain: input.explain === true },
        'search executed',
      )

      return input.explain === true
        ? { results, explain: explainRows(results) }
        : { results }
    },
  }
}

export function executeSearch(
  deps: SearchServiceDeps,
  input: ExecuteSearchInput,
): ExecuteSearchResult {
  return createSearchService(deps).executeSearch(input)
}

export function formatSearchResults(
  results: SearchResult[],
  opts: FormatSearchResultsOptions = {},
): string {
  if (opts.json) return JSON.stringify(results, null, 2)

  return results
    .map((result, index) => {
      const title = result.title ?? result.uri
      const snippet = result.bestChunk?.snippet ?? ''
      const base = `${index + 1}\t${result.sourceId}\t${title}\t${result.uri}\t${snippet}`
      if (!opts.explain || !result.explain) return base
      return `${base}\t${result.explain.matchedFrom}\t${result.explain.fusedScore}`
    })
    .join('\n')
}
