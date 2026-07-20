import type { SearchRouting } from '@ctxindex/extension-sdk'
import type { AuthService } from '../auth'
import { CtxindexContinuationError, CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type { ExtensionRegistry } from '../registry'
import { searchSourceRemote } from '../source'
import type { CtxindexDatabase } from '../storage'
import { LocalSearchExecutor } from './local-search'
import { resolveSearchQuery } from './preflight'
import type { LocalSearchFieldFilter, LocalSearchResult } from './types'

export interface SearchPlannerInput {
  readonly signal?: AbortSignal
  readonly text?: string
  readonly limit?: number
  readonly offset?: number
  readonly continuation?: string
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly adapterId?: string
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
  readonly includeDeleted?: boolean
  readonly localOnly?: boolean
  readonly remote?: boolean
  readonly explain?: boolean
  readonly now?: number
  readonly timeoutMs?: number
}

export interface UnifiedSearchResult {
  readonly ref: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly sourceId: string
  readonly origin: 'local' | 'provider'
  readonly originRank: number
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly deletedAt?: number
  readonly chunks: readonly {
    readonly index: number
    readonly snippet: string
  }[]
}

export interface SearchPlannerWarning {
  readonly sourceId: string
  readonly code: string
  readonly message: string
}

export interface SourceSearchExplain {
  readonly sourceId: string
  readonly routing: SearchRouting
  readonly decidedBy: 'cli' | 'source' | 'adapter' | 'unavailable'
  readonly legs: readonly ('local' | 'remote')[]
  readonly outcome:
    | 'success'
    | 'degraded'
    | 'unsupported'
    | 'extension_unavailable'
  readonly coverage: 'local' | 'remote' | 'local+remote'
}

export interface SearchPagination {
  readonly offset: number
  readonly limit: number
  readonly hasMore: boolean
}

export interface RemoteSearchPagination {
  readonly limit: number
  readonly hasMore: boolean
  readonly continuation: string | null
}

export interface SearchPlannerResult {
  readonly results: readonly UnifiedSearchResult[]
  readonly warnings: readonly SearchPlannerWarning[]
  readonly pagination?: SearchPagination | RemoteSearchPagination
  readonly explain?: { readonly sources: readonly SourceSearchExplain[] }
}

interface SourcePlanRow {
  readonly id: string
  readonly realm_slug: string
  readonly adapter_id: string
  readonly config_json: string
  readonly sync_enabled: number
  readonly search_routing: SearchRouting | null
  readonly last_status: string | null
  readonly last_run_status: string | null
}

interface PlannedSource {
  readonly row: SourcePlanRow
  readonly routing: SearchRouting
  readonly decidedBy: SourceSearchExplain['decidedBy']
  readonly legs: ('local' | 'remote')[]
  readonly coverage: SourceSearchExplain['coverage']
  readonly unavailable: boolean
}

function invalid(message: string): never {
  throw new CtxindexValidationError('invalid_filter', message)
}

function compatible(
  routing: SearchRouting,
  capabilities: readonly string[],
): boolean {
  if (routing === 'indexed') return true
  if (routing === 'federated') return capabilities.includes('search-remote')
  return capabilities.includes('sync') && capabilities.includes('search-remote')
}

function hybridCovered(
  row: SourcePlanRow,
  since: number | undefined,
  now: number,
): boolean {
  let config: { sync_window_days?: unknown }
  try {
    config = JSON.parse(row.config_json) as { sync_window_days?: unknown }
  } catch {
    return false
  }
  const days = config.sync_window_days
  return (
    typeof days === 'number' &&
    days > 0 &&
    row.sync_enabled === 1 &&
    row.last_status === 'idle' &&
    row.last_run_status === 'completed' &&
    since !== undefined &&
    since >= now - days * 86_400_000
  )
}

function interleave(
  origins: readonly (readonly UnifiedSearchResult[])[],
  limit: number,
): UnifiedSearchResult[] {
  const merged: UnifiedSearchResult[] = []
  const seen = new Set<string>()
  for (let rank = 0; merged.length < limit; rank += 1) {
    let added = false
    for (const origin of origins) {
      const item = origin[rank]
      if (!item) continue
      added = true
      if (seen.has(item.ref)) continue
      seen.add(item.ref)
      merged.push(item)
      if (merged.length === limit) break
    }
    if (!added) break
  }
  return merged
}

export class SearchPlanner {
  readonly #local: LocalSearchExecutor

  constructor(
    private readonly deps: {
      readonly db: CtxindexDatabase
      readonly registry: ExtensionRegistry
      readonly authService: AuthService
      readonly logger: Logger
      readonly fetch?: typeof fetch
    },
  ) {
    this.#local = new LocalSearchExecutor(deps.db, deps.registry.profiles)
  }

  async search(input: SearchPlannerInput): Promise<SearchPlannerResult> {
    input.signal?.throwIfAborted()
    if (input.localOnly && input.remote)
      invalid('--local-only and --remote are mutually exclusive')
    if (input.continuation !== undefined) {
      if (!input.continuation.trim()) invalid('continuation must not be empty')
      if (!input.remote) invalid('continuation requires remote execution')
      if (input.sourceIds?.length !== 1)
        invalid('continuation requires exactly one Source')
      if (input.offset !== undefined)
        invalid('continuation cannot be combined with offset')
    }
    const limit = input.limit ?? 20
    if (!Number.isInteger(limit) || limit <= 0)
      invalid('limit must be a positive integer')
    const hasFilter =
      (input.realms?.length ?? 0) > 0 ||
      (input.sourceIds?.length ?? 0) > 0 ||
      input.adapterId !== undefined ||
      input.kind !== undefined ||
      (input.fields?.length ?? 0) > 0 ||
      input.since !== undefined ||
      input.until !== undefined ||
      input.includeDeleted === true
    if (input.text === undefined && !hasFilter)
      invalid('query text or at least one filter is required')
    if (
      input.text === undefined &&
      input.remote === true &&
      (input.realms?.length ?? 0) === 0 &&
      (input.sourceIds?.length ?? 0) === 0 &&
      input.adapterId === undefined &&
      input.kind === undefined &&
      (input.fields?.length ?? 0) === 0 &&
      input.since === undefined &&
      input.until === undefined
    ) {
      invalid(
        'query-less remote execution requires a narrowing Realm, Adapter, Source, kind, field, or time filter',
      )
    }
    const localExecution =
      (input.text === undefined && input.remote !== true) ||
      input.localOnly === true
    const offset = input.offset ?? 0
    if (!Number.isInteger(offset) || offset < 0)
      invalid('offset must be a non-negative integer')
    if (input.offset !== undefined && !localExecution)
      invalid(
        'offset requires local execution: omit query text or pass --local-only',
      )
    const resolved = resolveSearchQuery(this.deps.registry.profiles, {
      text: input.text ?? '',
      limit,
      ...(input.continuation === undefined
        ? {}
        : { continuation: input.continuation }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.fields === undefined ? {} : { fields: input.fields }),
      ...(input.since === undefined ? {} : { since: input.since }),
      ...(input.until === undefined ? {} : { until: input.until }),
    })
    const selected = this.selectSources(input, resolved.kind)
    if (input.continuation !== undefined && selected.length !== 1)
      invalid('continuation requires exactly one selected Source')
    const warnings: SearchPlannerWarning[] = []
    const plans = selected.map((row) =>
      this.plan(
        row,
        localExecution ? { ...input, localOnly: true } : input,
        warnings,
      ),
    )

    const localIds = plans
      .filter((plan) => plan.legs.includes('local'))
      .map((plan) => plan.row.id)
    const localResults =
      localIds.length === 0
        ? []
        : this.#local.search({
            ...(input.text === undefined ? {} : { text: resolved.text }),
            limit: localExecution ? limit + 1 : limit,
            offset,
            sourceIds: localIds,
            ...(resolved.kind === undefined ? {} : { kind: resolved.kind }),
            ...(input.fields === undefined ? {} : { fields: input.fields }),
            ...(resolved.since === undefined ? {} : { since: resolved.since }),
            ...(resolved.until === undefined ? {} : { until: resolved.until }),
            ...(input.includeDeleted ? { deleted: 'include' as const } : {}),
          })
    const hasMore = localExecution && localResults.length > limit
    const localUnified = (
      localExecution ? localResults.slice(0, limit) : localResults
    ).map((result, originRank) => this.localResult(result, originRank))

    const outcome = new Map<string, SourceSearchExplain['outcome']>()
    const remotePlans = plans
      .filter((candidate) => candidate.legs.includes('remote'))
      .sort((a, b) => a.row.id.localeCompare(b.row.id))
    const remoteRuns = await Promise.all(
      remotePlans.map(async (plan) => {
        const controller = new AbortController()
        const cancel = () => controller.abort(input.signal?.reason)
        if (input.signal?.aborted) cancel()
        else input.signal?.addEventListener('abort', cancel, { once: true })
        const timer = setTimeout(
          () =>
            controller.abort(
              new DOMException('Remote search timed out', 'TimeoutError'),
            ),
          input.timeoutMs ?? 10_000,
        )
        try {
          const remote = await searchSourceRemote({
            db: this.deps.db,
            sourceId: plan.row.id,
            registry: this.deps.registry,
            authService: this.deps.authService,
            logger: this.deps.logger,
            query: resolved,
            signal: controller.signal,
            ...(this.deps.fetch === undefined
              ? {}
              : { fetch: this.deps.fetch }),
          })
          return {
            sourceId: plan.row.id,
            origin: remote.resources.map((resource, originRank) => ({
              ref: resource.ref,
              profile: resource.profile,
              sourceId: plan.row.id,
              origin: 'provider' as const,
              originRank,
              title: resource.title ?? null,
              summary: resource.summary ?? null,
              occurredAt: resource.occurredAt ?? null,
              chunks: [],
            })),
            warnings: remote.warnings.map((warning) => ({
              sourceId: plan.row.id,
              code: warning.code,
              message: warning.message,
            })),
            continuation: remote.continuation,
            outcome: remote.warnings.length === 0 ? 'success' : 'degraded',
          } as const
        } catch (cause) {
          if (input.signal?.aborted) {
            throw input.signal.reason instanceof Error
              ? input.signal.reason
              : new DOMException('The search was cancelled.', 'AbortError')
          }
          if (cause instanceof CtxindexContinuationError) throw cause
          return {
            sourceId: plan.row.id,
            origin: [],
            warnings: [
              {
                sourceId: plan.row.id,
                code: controller.signal.aborted
                  ? 'timeout'
                  : typeof cause === 'object' &&
                      cause !== null &&
                      'code' in cause &&
                      typeof cause.code === 'string'
                    ? cause.code
                    : 'provider_failure',
                message: cause instanceof Error ? cause.message : String(cause),
              },
            ],
            continuation: undefined,
            outcome: 'degraded',
          } as const
        } finally {
          clearTimeout(timer)
          input.signal?.removeEventListener('abort', cancel)
        }
      }),
    )
    const providerOrigins = remoteRuns.map((run) => {
      warnings.push(...run.warnings)
      outcome.set(run.sourceId, run.outcome)
      return run.origin
    })

    const results = interleave([localUnified, ...providerOrigins], limit)
    const remotePagination =
      input.remote === true &&
      input.sourceIds?.length === 1 &&
      remoteRuns.length === 1
        ? {
            limit,
            hasMore: remoteRuns[0]?.continuation !== undefined,
            continuation: remoteRuns[0]?.continuation ?? null,
          }
        : undefined
    const explain = plans.map((plan) => ({
      sourceId: plan.row.id,
      routing: plan.routing,
      decidedBy: plan.decidedBy,
      legs: plan.legs,
      outcome: plan.unavailable
        ? 'extension_unavailable'
        : plan.legs.length === 0
          ? 'unsupported'
          : (outcome.get(plan.row.id) ?? 'success'),
      coverage: plan.coverage,
    }))
    return {
      results,
      ...(localExecution
        ? { pagination: { offset, limit, hasMore } }
        : remotePagination === undefined
          ? {}
          : { pagination: remotePagination }),
      warnings: warnings.sort(
        (a, b) =>
          a.sourceId.localeCompare(b.sourceId) || a.code.localeCompare(b.code),
      ),
      ...(input.explain ? { explain: { sources: explain } } : {}),
    }
  }

  private selectSources(
    input: SearchPlannerInput,
    kind: string | undefined,
  ): SourcePlanRow[] {
    const rows = this.deps.db
      .prepare<SourcePlanRow, []>(`
      SELECT s.id, r.slug AS realm_slug, s.adapter_id,
             s.config_json, s.sync_enabled, s.search_routing, sss.last_status,
             sr.status AS last_run_status
      FROM sources s
      JOIN realms r ON r.id = s.realm_id
      LEFT JOIN source_sync_state sss ON sss.source_id = s.id
      LEFT JOIN sync_runs sr ON sr.id = sss.last_run_id
      ORDER BY s.id
    `)
      .all()
    const realms = [...new Set(input.realms ?? [])]
    const sourceIds = [...new Set(input.sourceIds ?? [])]
    for (const realm of realms) {
      const exists = this.deps.db
        .prepare('SELECT 1 FROM realms WHERE slug = ?')
        .get(realm)
      if (!exists) invalid(`Unknown Realm "${realm}"`)
    }
    for (const sourceId of sourceIds) {
      if (!rows.some((row) => row.id === sourceId))
        invalid(`Unknown Source "${sourceId}"`)
    }
    return rows.filter((row) => {
      if (realms.length > 0 && !realms.includes(row.realm_slug)) return false
      if (sourceIds.length > 0 && !sourceIds.includes(row.id)) return false
      if (input.adapterId !== undefined && row.adapter_id !== input.adapterId)
        return false
      const adapter = this.deps.registry.adapters.get({ id: row.adapter_id })
      return (
        adapter === undefined ||
        kind === undefined ||
        adapter.profiles.some((profile) => profile.id === kind)
      )
    })
  }

  private plan(
    row: SourcePlanRow,
    input: SearchPlannerInput,
    warnings: SearchPlannerWarning[],
  ): PlannedSource {
    const adapter = this.deps.registry.adapters.get({ id: row.adapter_id })
    if (!adapter) {
      warnings.push({
        sourceId: row.id,
        code: 'extension_unavailable',
        message: `Source "${row.id}" uses unavailable Adapter ${row.adapter_id}`,
      })
      const remoteOnly = input.remote === true
      return {
        row,
        routing: remoteOnly ? 'federated' : 'indexed',
        decidedBy: 'unavailable',
        legs: remoteOnly ? [] : ['local'],
        coverage: remoteOnly ? 'remote' : 'local',
        unavailable: true,
      }
    }
    let routing = adapter.routing
    let decidedBy: SourceSearchExplain['decidedBy'] = 'adapter'
    if (input.localOnly) {
      routing = 'indexed'
      decidedBy = 'cli'
    } else if (input.remote) {
      routing = 'federated'
      decidedBy = 'cli'
    } else if (row.search_routing !== null) {
      if (compatible(row.search_routing, adapter.capabilities)) {
        routing = row.search_routing
        decidedBy = 'source'
      } else {
        warnings.push({
          sourceId: row.id,
          code: 'stale_search_routing',
          message: `Stored search routing ${row.search_routing} is incompatible with Adapter ${adapter.id}; using ${adapter.routing}`,
        })
      }
    }
    if (
      routing === 'federated' &&
      !adapter.capabilities.includes('search-remote')
    ) {
      warnings.push({
        sourceId: row.id,
        code: 'remote_search_unsupported',
        message: `Source "${row.id}" does not support remote search`,
      })
      return {
        row,
        routing,
        decidedBy,
        legs: [],
        coverage: 'remote',
        unavailable: false,
      }
    }
    if (routing === 'indexed')
      return {
        row,
        routing,
        decidedBy,
        legs: ['local'],
        coverage: 'local',
        unavailable: false,
      }
    if (routing === 'federated')
      return {
        row,
        routing,
        decidedBy,
        legs: ['remote'],
        coverage: 'remote',
        unavailable: false,
      }
    const covered = hybridCovered(row, input.since, input.now ?? Date.now())
    return {
      row,
      routing,
      decidedBy,
      legs: covered ? ['local'] : ['local', 'remote'],
      coverage: covered ? 'local' : 'local+remote',
      unavailable: false,
    }
  }

  private localResult(
    result: LocalSearchResult,
    originRank: number,
  ): UnifiedSearchResult {
    return {
      ref: result.ref,
      profile: result.profile,
      sourceId: result.sourceId,
      origin: 'local',
      originRank,
      title: result.envelope.title,
      summary: result.envelope.summary,
      occurredAt: result.envelope.occurredAt,
      ...(result.envelope.deletedAt === null
        ? {}
        : { deletedAt: result.envelope.deletedAt }),
      chunks: result.chunks.map((chunk) => ({
        index: chunk.index,
        snippet: chunk.snippet,
      })),
    }
  }
}
