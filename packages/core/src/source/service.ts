import { ulid } from 'ulid'
import { isGrantCompatible, providerKeyForAuth } from '../auth'
import {
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexValidationError,
} from '../errors'
import type {
  AddSourceInput,
  AddSourceResult,
  ListSourcesInput,
  SourceRow,
  SourceService,
  SourceServiceDeps,
  StatusRow,
} from './types'

interface RealmIdRow {
  readonly id: string
}

function resolveAdapter(deps: SourceServiceDeps, input: AddSourceInput) {
  const adapter =
    input.adapterVersion !== undefined
      ? deps.registry.adapters.get({
          id: input.adapterId,
          version: input.adapterVersion,
        })
      : deps.registry.adapters
          .list()
          .filter((candidate) => candidate.id === input.adapterId)
          .sort((left, right) => right.version - left.version)[0]
  if (!adapter) {
    const version =
      input.adapterVersion !== undefined ? `@${input.adapterVersion}` : ''
    throw new CtxindexValidationError(
      'invalid_filter',
      `Unknown Adapter: ${input.adapterId}${version}`,
    )
  }
  return adapter
}

function validateSearchRouting(
  routing: AddSourceInput['searchRouting'],
  capabilities: readonly string[],
): void {
  if (routing === 'federated' && !capabilities.includes('search-remote')) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'federated search routing requires search-remote',
    )
  }
  if (
    routing === 'hybrid' &&
    (!capabilities.includes('sync') || !capabilities.includes('search-remote'))
  ) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'hybrid search routing requires sync and search-remote',
    )
  }
}

function resolveGrantId(
  deps: SourceServiceDeps,
  input: AddSourceInput,
  auth: ReturnType<typeof resolveAdapter>['auth'],
): string | null {
  if (auth.kind === 'none') {
    if (input.grantId) {
      throw new CtxindexValidationError(
        'invalid_filter',
        `Adapter "${input.adapterId}" does not accept a Grant`,
      )
    }
    return null
  }
  if (auth.kind !== 'oauth2') {
    throw new CtxindexValidationError(
      'invalid_filter',
      `Adapter "${input.adapterId}" uses unsupported auth kind "${(auth as { kind: string }).kind}"`,
    )
  }

  const grants = deps.db
    .prepare('SELECT id, provider, scopes_json FROM grants ORDER BY id')
    .all() as GrantRow[]
  const compatible = grants.filter((grant) =>
    isGrantCompatible(auth, {
      provider: grant.provider,
      scopes: grant.scopes_json,
    }),
  )
  const provider = providerKeyForAuth(auth) ?? 'unknown'
  if (input.grantId) {
    const selected = grants.find((grant) => grant.id === input.grantId)
    if (!selected || !compatible.includes(selected)) {
      throw new CtxindexValidationError(
        'invalid_filter',
        `Grant "${input.grantId}" is not compatible with Adapter "${input.adapterId}" (provider "${provider}" and required scopes)`,
      )
    }
    return selected.id
  }
  if (compatible.length === 0) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `No compatible Grants for Adapter "${input.adapterId}" (provider "${provider}" and required scopes); add or select one explicitly`,
    )
  }
  if (compatible.length > 1) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `Found multiple compatible Grants for Adapter "${input.adapterId}"; select one explicitly`,
    )
  }
  return compatible[0]?.id ?? null
}

interface GrantRow {
  readonly id: string
  readonly provider: string
  readonly scopes_json: string
}

interface StatusDbRow {
  readonly sourceId: string
  readonly adapterId: string
  readonly adapterVersion: number
  readonly realmSlug: string
  readonly lastStatus: string
  readonly lastRunAt: number | null
  readonly errorsCount: number | null
  readonly cursorJson: string | null
  readonly errorJson: string | null
}

function sourceAvailability(
  deps: SourceServiceDeps,
  source: Pick<SourceRow, 'adapter_id' | 'adapter_version'>,
): SourceRow['availability'] {
  return deps.registry.adapters.get({
    id: source.adapter_id,
    version: source.adapter_version,
  })
    ? 'available'
    : 'extension_unavailable'
}

function withAvailability(
  deps: SourceServiceDeps,
  source: Omit<SourceRow, 'availability'>,
): SourceRow {
  return { ...source, availability: sourceAvailability(deps, source) }
}

function parseCursor(cursorJson: string | null): unknown {
  return cursorJson === null ? null : JSON.parse(cursorJson)
}

function parseLastError(errorJson: string | null): string | null {
  if (!errorJson) return null
  try {
    const parsed = JSON.parse(errorJson) as unknown
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object') {
      const message = (parsed as { message?: unknown; error?: unknown }).message
      if (typeof message === 'string') return message
      const error = (parsed as { error?: unknown }).error
      if (typeof error === 'string') return error
      const code = (parsed as { code?: unknown }).code
      if (typeof code === 'string') return code
    }
  } catch {
    return errorJson
  }
  return errorJson
}

function selectSourceColumns(): string {
  return 'id, realm_id, adapter_id, adapter_version, display_name, config_json, sync_enabled, grant_id, search_routing, created_at'
}

function sourceListSelect(): string {
  return `SELECT s.id,
                 s.realm_id,
                 r.slug AS realm_slug,
                 s.adapter_id,
                 s.adapter_version,
                 s.display_name,
                 s.config_json,
                 s.sync_enabled,
                 s.grant_id,
                 s.search_routing,
                 s.created_at,
                 sss.last_status,
                 sr.completed_at AS last_run_at,
                 COALESCE(sr.errors_count, 0) AS errors_count,
                 (SELECT COUNT(*) FROM resources resource WHERE resource.source_id = s.id AND resource.deleted_at IS NULL) AS items_count,
                 (SELECT COUNT(*)
                    FROM chunks c
                    JOIN resources resource ON resource.id = c.resource_id
                   WHERE resource.source_id = s.id AND resource.deleted_at IS NULL) AS chunks_count,
                 (SELECT resource.ref FROM resources resource WHERE resource.source_id = s.id AND resource.deleted_at IS NULL ORDER BY resource.ref LIMIT 1) AS sample_uri,
                 a.label AS account_email
          FROM sources s
          JOIN realms r ON r.id = s.realm_id
          LEFT JOIN source_sync_state sss ON sss.source_id = s.id
          LEFT JOIN sync_runs sr ON sr.id = sss.last_run_id
          LEFT JOIN grants g ON g.id = s.grant_id
          LEFT JOIN accounts a ON a.id = g.account_id`
}

function resolveRealm(deps: SourceServiceDeps, slug: string): RealmIdRow {
  const realm =
    deps.realmService?.getRealmBySlug(slug) ??
    (deps.db
      .prepare('SELECT id FROM realms WHERE slug = ?')
      .get(slug) as RealmIdRow | null)
  if (!realm) {
    throw new CtxindexValidationError(
      'unknown_realm',
      `unknown realm "${slug}"; create it with: ctxindex realm add ${slug}`,
    )
  }
  return { id: realm.id }
}

export function createSourceService(deps: SourceServiceDeps): SourceService {
  return {
    addSource(input: AddSourceInput): AddSourceResult {
      if (!input.realmSlug) {
        throw new CtxindexValidationError(
          'unknown_realm',
          'Source creation requires an explicit Realm',
        )
      }
      const realm = resolveRealm(deps, input.realmSlug)
      const adapter = resolveAdapter(deps, input)
      validateSearchRouting(input.searchRouting, adapter.capabilities)
      const grantId = resolveGrantId(deps, input, adapter.auth)
      let config: unknown
      try {
        config = JSON.parse(input.configJson ?? '{}')
      } catch (cause) {
        throw new CtxindexError(
          'Source config is invalid',
          'invalid_source_config',
          { cause },
        )
      }
      const parsedConfig = adapter.configSchema.safeParse(config)
      if (!parsedConfig.success) {
        throw new CtxindexError(
          'Source config is invalid',
          'invalid_source_config',
          { cause: parsedConfig.error },
        )
      }
      const sourceId = ulid()
      const now = Date.now()
      deps.db
        .prepare(
          `INSERT INTO sources (
             id, realm_id, adapter_id, adapter_version, display_name, config_json,
             grant_id, search_routing, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sourceId,
          realm.id,
          input.adapterId,
          adapter.version,
          input.displayName ?? null,
          JSON.stringify(parsedConfig.data),
          grantId,
          input.searchRouting ?? null,
          now,
          now,
        )

      deps.logger.debug(
        { sourceId, realmId: realm.id, adapterId: input.adapterId },
        'source added',
      )
      return { sourceId, realmId: realm.id }
    },

    listSources(input: ListSourcesInput = {}): SourceRow[] {
      const select = sourceListSelect()
      if (input.realmSlug) {
        const rows = deps.db
          .prepare(
            `${select}
             WHERE r.slug = ?
             ORDER BY s.created_at`,
          )
          .all(input.realmSlug) as Omit<SourceRow, 'availability'>[]
        return rows.map((source) => withAvailability(deps, source))
      }
      const rows = deps.db
        .prepare(`${select} ORDER BY s.created_at`)
        .all() as Omit<SourceRow, 'availability'>[]
      return rows.map((source) => withAvailability(deps, source))
    },

    findSourceById(sourceId: string): SourceRow | null {
      const source = deps.db
        .prepare(`SELECT ${selectSourceColumns()} FROM sources WHERE id = ?`)
        .get(sourceId) as Omit<SourceRow, 'availability'> | null
      return source ? withAvailability(deps, source) : null
    },

    removeSource(sourceId: string): void {
      const existing = deps.db
        .prepare('SELECT id FROM sources WHERE id = ?')
        .get(sourceId)
      if (!existing) {
        throw new CtxindexNotFoundError(`source not found: "${sourceId}"`)
      }
      // Source-owned generic rows are declared with ON DELETE CASCADE in the
      // canonical schema. Adapters never own storage tables (SPEC §§3b, 8).
      deps.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
      deps.logger.debug({ sourceId }, 'source removed')
    },

    getStatus(input: { sourceId?: string } = {}): StatusRow[] {
      // SPEC §10b: a reference to an unknown source MUST fail fast, not return
      // an empty/ambiguous result. A known but never-synced source is allowed
      // (it simply has no sync-state row yet).
      if (input.sourceId !== undefined) {
        const exists = deps.db
          .prepare('SELECT id FROM sources WHERE id = ?')
          .get(input.sourceId)
        if (!exists) {
          throw new CtxindexNotFoundError(
            `source not found: "${input.sourceId}"`,
          )
        }
      }
      const base = `
        SELECT s.id AS sourceId,
               s.adapter_id AS adapterId,
               s.adapter_version AS adapterVersion,
               r.slug AS realmSlug,
               COALESCE(sss.last_status, 'pending') AS lastStatus,
               sr.completed_at AS lastRunAt,
               sr.errors_count AS errorsCount,
               sss.cursor_json AS cursorJson,
               sr.error_summary AS errorJson
        FROM sources s
        JOIN realms r ON r.id = s.realm_id
        LEFT JOIN source_sync_state sss ON sss.source_id = s.id
        LEFT JOIN sync_runs sr ON sr.id = sss.last_run_id
      `
      const rows = input.sourceId
        ? (deps.db
            .prepare(`${base} WHERE s.id = ?`)
            .all(input.sourceId) as StatusDbRow[])
        : (deps.db
            .prepare(
              `${base} ORDER BY COALESCE(sss.updated_at, s.created_at) DESC`,
            )
            .all() as StatusDbRow[])

      return rows.map((row) => ({
        sourceId: row.sourceId,
        adapterId: row.adapterId,
        realmSlug: row.realmSlug,
        availability: sourceAvailability(deps, {
          adapter_id: row.adapterId,
          adapter_version: row.adapterVersion,
        }),
        lastStatus: row.lastStatus,
        lastRunAt: row.lastRunAt,
        errorsCount: row.errorsCount ?? 0,
        lastError: parseLastError(row.errorJson),
        cursor: parseCursor(row.cursorJson),
      }))
    },
  }
}
