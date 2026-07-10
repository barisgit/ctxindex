import { CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type { CtxindexDatabase } from '../storage'
import { search } from './search'
import type { ExplainInfo, SearchFilters, SearchResult } from './types'

export type SearchOutputFormat = 'legacy' | 'refs' | 'compact' | 'context'

export interface SearchServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
}

export interface ExecuteSearchInput {
  readonly query: string
  readonly realmSlug?: string
  readonly providerFilter?: string
  readonly adapterFilter?: string
  readonly sourceFilter?: string
  readonly mimeFilter?: string
  readonly since?: number | string | Date
  readonly until?: number | string | Date
  readonly includeDeleted?: boolean
  readonly limit?: number
  readonly snippetChars?: number
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
  readonly format?: SearchOutputFormat
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
  if (input.providerFilter) filters.providers = [input.providerFilter]
  if (input.adapterFilter) filters.adapters = [input.adapterFilter]
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
      const snippetChars = input.snippetChars ?? 200
      if (!Number.isInteger(snippetChars) || snippetChars < 1) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid snippet chars: ${input.snippetChars}`,
        )
      }

      const results = search(deps.db, {
        query: input.query,
        filters: buildFilters(input),
        limit,
        snippetChars,
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

  if (opts.format === 'refs')
    return results.map((result) => result.uri).join('\n')

  if (opts.format === 'compact') {
    return results
      .map((result, index) => {
        const title = result.title ?? result.uri
        const snippet = (result.bestChunk?.snippet ?? '').replace(/\s+/g, ' ')
        return `${index + 1}\t${result.kind}\t${result.uri}\t${title}\t${snippet}`
      })
      .join('\n')
  }

  if (opts.format === 'context') {
    return results
      .map((result, index) => {
        const title = result.title ?? result.uri
        const lines = [
          `${index + 1}. ${title}`,
          `ref: ${result.uri}`,
          `kind: ${result.kind}`,
          `source: ${result.sourceId}`,
        ]
        if (result.deletedAt !== null)
          lines.push(`deletedAt: ${result.deletedAt}`)
        if (result.bestChunk?.snippet)
          lines.push(`snippet: ${result.bestChunk.snippet}`)
        if (opts.explain && result.explain) {
          lines.push(`matchedFrom: ${result.explain.matchedFrom}`)
          lines.push(`score: ${result.explain.fusedScore}`)
        }
        return lines.join('\n')
      })
      .join('\n\n')
  }

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
