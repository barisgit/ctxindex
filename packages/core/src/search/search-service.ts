import { ulid } from 'ulid'
import { CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type {
  AdapterSearchFunction,
  AdapterSearchMode,
  AdapterSearchQuery,
  AdapterSearchResult,
} from '../registry'
import type { CtxindexDatabase } from '../storage'
import { search } from './search'
import type {
  ExplainInfo,
  SearchFilters,
  SearchResult,
  SearchWarning,
} from './types'

export type SearchOutputFormat = 'legacy' | 'refs' | 'compact' | 'context'

// Minimal registry surface the planner needs (SPEC §10e).
export interface SearchPlannerRegistry {
  isKnownAdapter(id: string): boolean
  getSearchMode(id: string): AdapterSearchMode
  getSearchFn(id: string): AdapterSearchFunction | undefined
}

export interface SearchServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  /** Enables provider-search fan-out for federated/hybrid sources. */
  readonly registry?: SearchPlannerRegistry
  /** Resolves per-source adapter config (e.g. injects OAuth access tokens). */
  readonly resolveSearchConfig?: (
    sourceId: string,
    adapterId: string,
    config: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
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
  readonly localOnly?: boolean
  readonly output?: 'text' | 'json'
}

export interface ExplainRow extends ExplainInfo {
  readonly itemId: string
}

export interface ExecuteSearchResult {
  readonly results: SearchResult[]
  readonly explain?: ExplainRow[]
  readonly warnings?: SearchWarning[]
}

export interface FormatSearchResultsOptions {
  readonly json?: boolean
  readonly explain?: boolean
  readonly format?: SearchOutputFormat
}

export interface SearchService {
  executeSearch(input: ExecuteSearchInput): Promise<ExecuteSearchResult>
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

interface FederatedSourceRow {
  id: string
  realm_id: string
  adapter_id: string
  config_json: string | null
}

function federatedSources(
  deps: SearchServiceDeps,
  filters: SearchFilters,
): FederatedSourceRow[] {
  const registry = deps.registry
  if (!registry) return []
  const rows = deps.db
    .prepare(
      'SELECT id, realm_id, adapter_id, config_json FROM sources ORDER BY created_at',
    )
    .all() as FederatedSourceRow[]
  return rows.filter((row) => {
    if (!registry.isKnownAdapter(row.adapter_id)) return false
    if (registry.getSearchMode(row.adapter_id) === 'indexed') return false
    if (filters.sources && !filters.sources.includes(row.id)) return false
    if (filters.adapters && !filters.adapters.includes(row.adapter_id))
      return false
    if (
      filters.providers &&
      !filters.providers.includes(row.adapter_id.split('.')[0] ?? '')
    )
      return false
    return true
  })
}

/**
 * Resolve a provider search result to a core item via external_refs;
 * materialize a metadata-only item when unmatched (SPEC §10e).
 */
function resolveProviderItem(
  db: CtxindexDatabase,
  source: FederatedSourceRow,
  result: AdapterSearchResult,
): string {
  const existing = db
    .prepare(
      `SELECT item_id FROM external_refs
       WHERE source_id = ? AND kind = 'message' AND value = ?`,
    )
    .get(source.id, result.externalId) as { item_id: string } | null
  if (existing) return existing.item_id

  const itemId = ulid()
  const nowMs = Date.now()
  const uri = result.uri ?? `${source.adapter_id}:${result.externalId}`
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO items
         (id, source_id, realm_id, adapter_id, kind, uri, title, indexed_at, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, 'mailbox', ?, ?, ?, ?, ?)`,
    ).run(
      itemId,
      source.id,
      source.realm_id,
      source.adapter_id,
      uri,
      result.title,
      result.timestamp ?? nowMs,
      nowMs,
      JSON.stringify({ hydrated: false, ...(result.metadata ?? {}) }),
    )
    db.prepare(
      `INSERT INTO external_refs (id, source_id, item_id, kind, value, created_at)
       VALUES (?, ?, ?, 'message', ?, ?)
       ON CONFLICT (source_id, kind, value) DO NOTHING`,
    ).run(ulid(), source.id, itemId, result.externalId, nowMs)
  })
  tx()
  return itemId
}

function toSearchResult(
  db: CtxindexDatabase,
  source: FederatedSourceRow,
  result: AdapterSearchResult,
  explain: boolean,
): SearchResult {
  const itemId = resolveProviderItem(db, source, result)
  const row = db
    .prepare(
      `SELECT id, source_id, adapter_id, realm_id, kind, uri, title,
              indexed_at, updated_at, deleted_at
       FROM items WHERE id = ?`,
    )
    .get(itemId) as {
    id: string
    source_id: string
    adapter_id: string
    realm_id: string
    kind: string
    uri: string
    title: string | null
    indexed_at: number
    updated_at: number
    deleted_at: number | null
  }
  const mapped: SearchResult = {
    itemId: row.id,
    sourceId: row.source_id,
    adapterId: row.adapter_id,
    realmId: row.realm_id,
    kind: row.kind,
    uri: row.uri,
    title: row.title,
    indexedAt: row.indexed_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    score: 0,
    origin: 'provider',
    matchedFrom: 'items_fts',
    bestChunk: result.snippet
      ? { chunkId: '', chunkIndex: -1, snippet: result.snippet }
      : null,
  }
  if (explain) {
    mapped.explain = {
      origin: 'provider',
      providerRank: result.rank,
      matchedFrom: 'items_fts',
      itemFtsRank: null,
      chunkFtsRank: null,
      fusedScore: 0,
      matchedChunkIds: [],
      snippets: result.snippet ? [result.snippet] : [],
    }
  }
  return mapped
}

async function providerOrigin(
  deps: SearchServiceDeps,
  input: ExecuteSearchInput,
  filters: SearchFilters,
  limit: number,
): Promise<{ results: SearchResult[]; warnings: SearchWarning[] }> {
  const registry = deps.registry
  const results: SearchResult[] = []
  const warnings: SearchWarning[] = []
  if (!registry || input.localOnly === true) return { results, warnings }

  const sources = federatedSources(deps, filters)
  await Promise.all(
    sources.map(async (source) => {
      const searchFn = registry.getSearchFn(source.adapter_id)
      if (!searchFn) return
      try {
        const config = parseConfigJson(source.config_json)
        const resolved = deps.resolveSearchConfig
          ? await deps.resolveSearchConfig(source.id, source.adapter_id, config)
          : config
        const query: AdapterSearchQuery = {
          text: input.query,
          limit,
          ...(filters.since !== undefined ? { since: filters.since } : {}),
          ...(filters.until !== undefined ? { until: filters.until } : {}),
          ...(filters.kinds !== undefined ? { kinds: filters.kinds } : {}),
        }
        const providerResults = await searchFn(
          {
            sourceId: source.id,
            config: resolved,
            logger: deps.logger,
            signal: new AbortController().signal,
          },
          query,
        )
        for (const result of providerResults) {
          results.push(
            toSearchResult(deps.db, source, result, input.explain === true),
          )
        }
      } catch (err) {
        // SPEC §10e: provider-origin failure degrades to local results.
        const code = (err as { code?: string }).code ?? 'provider_error'
        deps.logger.warn(
          { sourceId: source.id, adapterId: source.adapter_id, code },
          'provider search failed; returning local results only',
        )
        warnings.push({
          sourceId: source.id,
          adapterId: source.adapter_id,
          code,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
  return { results, warnings }
}

function parseConfigJson(configJson: string | null): Record<string, unknown> {
  if (!configJson) return {}
  try {
    const parsed = JSON.parse(configJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

// SPEC §10e: per-origin rank, round-robin interleave (local first), local wins dedupe.
function interleave(
  local: SearchResult[],
  provider: SearchResult[],
  limit: number,
): SearchResult[] {
  const localIds = new Set(local.map((result) => result.itemId))
  const providerOnly = provider.filter((result) => !localIds.has(result.itemId))
  const merged: SearchResult[] = []
  const max = Math.max(local.length, providerOnly.length)
  for (let i = 0; i < max && merged.length < limit; i++) {
    const localEntry = local[i]
    if (localEntry) merged.push(localEntry)
    if (merged.length >= limit) break
    const providerEntry = providerOnly[i]
    if (providerEntry) merged.push(providerEntry)
  }
  return merged
}

export function createSearchService(deps: SearchServiceDeps): SearchService {
  return {
    async executeSearch(
      input: ExecuteSearchInput,
    ): Promise<ExecuteSearchResult> {
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

      const filters = buildFilters(input)
      const localResults = search(deps.db, {
        query: input.query,
        filters,
        limit,
        snippetChars,
        explain: input.explain === true,
      })
      const provider = await providerOrigin(deps, input, filters, limit)
      const results =
        provider.results.length > 0
          ? interleave(localResults, provider.results, limit)
          : localResults
      deps.logger.debug(
        {
          local: localResults.length,
          provider: provider.results.length,
          warnings: provider.warnings.length,
          explain: input.explain === true,
        },
        'search executed',
      )

      const envelope: ExecuteSearchResult = {
        results,
        ...(provider.warnings.length > 0
          ? { warnings: provider.warnings }
          : {}),
      }
      return input.explain === true
        ? { ...envelope, explain: explainRows(results) }
        : envelope
    },
  }
}

export function executeSearch(
  deps: SearchServiceDeps,
  input: ExecuteSearchInput,
): Promise<ExecuteSearchResult> {
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
