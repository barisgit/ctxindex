import { ulid } from 'ulid'
import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
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

interface StatusDbRow {
  readonly sourceId: string
  readonly adapterId: string
  readonly realmSlug: string
  readonly lastStatus: string
  readonly lastRunAt: number | null
  readonly errorsCount: number | null
  readonly cursorJson: string | null
  readonly errorJson: string | null
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

function hasColumn(
  deps: SourceServiceDeps,
  table: string,
  column: string,
): boolean {
  const rows = deps.db.prepare(`PRAGMA table_info(${table})`).all() as {
    readonly name: string
  }[]
  return rows.some((row) => row.name === column)
}

function selectSourceColumns(includeGrantId: boolean): string {
  return includeGrantId
    ? 'id, realm_id, adapter_id, display_name, config_json, grant_id, created_at'
    : 'id, realm_id, adapter_id, display_name, config_json, created_at'
}

function sourceListSelect(includeGrantId: boolean): string {
  const grantColumn = includeGrantId ? ', s.grant_id' : ''
  return `SELECT s.id,
                 s.realm_id,
                 r.slug AS realm_slug,
                 s.adapter_id,
                 s.display_name,
                 s.config_json${grantColumn},
                 s.created_at,
                 sss.last_status,
                 sr.completed_at AS last_run_at,
                 COALESCE(sr.errors_count, 0) AS errors_count,
                 (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id AND i.deleted_at IS NULL) AS items_count,
                 (SELECT COUNT(*)
                    FROM item_chunks ic
                    JOIN items i ON i.id = ic.item_id
                   WHERE i.source_id = s.id AND i.deleted_at IS NULL) AS chunks_count,
                 (SELECT i.uri FROM items i WHERE i.source_id = s.id AND i.deleted_at IS NULL ORDER BY i.uri LIMIT 1) AS sample_uri,
                 ${
                   includeGrantId
                     ? `(CASE WHEN s.adapter_id = 'google.mailbox'
                         THEN COALESCE(
                           a.email,
                           (SELECT a2.email
                              FROM grants g2
                              JOIN accounts a2 ON a2.id = g2.account_id
                             WHERE g2.provider = 'google' AND a2.email IS NOT NULL
                             ORDER BY g2.updated_at DESC, g2.created_at DESC
                             LIMIT 1)
                         )
                         ELSE a.email
                       END) AS account_email`
                     : 'NULL AS account_email'
}
          FROM sources s
          JOIN realms r ON r.id = s.realm_id
          LEFT JOIN source_sync_state sss ON sss.source_id = s.id
          LEFT JOIN sync_runs sr ON sr.id = sss.last_run_id
          ${
            includeGrantId
              ? 'LEFT JOIN grants g ON g.id = s.grant_id LEFT JOIN accounts a ON a.id = g.account_id'
              : ''
          }`
}

/** Upper bound on cascade-sweep passes (max FK chain depth is a small constant). */
const MAX_CASCADE_PASSES = 50

interface ForeignKeyEdge {
  readonly table: string
  readonly column: string
  readonly refTable: string
  readonly refColumn: string
}

/**
 * Discovers every foreign-key edge in user tables (core + adapter-owned),
 * skipping SQLite internals, FTS shadow tables, and migration bookkeeping.
 * Used to cascade-delete FK-orphaned rows without hardcoding table names.
 */
function collectForeignKeyEdges(db: SourceServiceDeps['db']): ForeignKeyEdge[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '%_fts%'
         AND name NOT LIKE 'ctxindex_migrations_%'`,
    )
    .all() as { name: string }[]
  return tables.flatMap(({ name }) =>
    (
      db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as {
        table: string
        from: string
        to: string
      }[]
    ).map((fk) => ({
      table: name,
      column: fk.from,
      refTable: fk.table,
      refColumn: fk.to,
    })),
  )
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
      const realm = resolveRealm(deps, input.realmSlug ?? 'global')
      const sourceId = ulid()
      const now = Date.now()
      const includeGrantId =
        input.grantId !== undefined && hasColumn(deps, 'sources', 'grant_id')

      if (includeGrantId) {
        deps.db
          .prepare(
            `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, grant_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sourceId,
            realm.id,
            input.adapterId,
            input.displayName ?? null,
            input.configJson ?? null,
            input.grantId ?? null,
            now,
          )
      } else {
        deps.db
          .prepare(
            `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sourceId,
            realm.id,
            input.adapterId,
            input.displayName ?? null,
            input.configJson ?? null,
            now,
          )
      }

      deps.logger.debug(
        { sourceId, realmId: realm.id, adapterId: input.adapterId },
        'source added',
      )
      return { sourceId, realmId: realm.id }
    },

    listSources(input: ListSourcesInput = {}): SourceRow[] {
      const includeGrantId = hasColumn(deps, 'sources', 'grant_id')
      const select = sourceListSelect(includeGrantId)
      if (input.realmSlug) {
        return deps.db
          .prepare(
            `${select}
             WHERE r.slug = ?
             ORDER BY s.created_at`,
          )
          .all(input.realmSlug) as SourceRow[]
      }
      return deps.db
        .prepare(`${select} ORDER BY s.created_at`)
        .all() as SourceRow[]
    },

    findSourceById(sourceId: string): SourceRow | null {
      const includeGrantId = hasColumn(deps, 'sources', 'grant_id')
      return deps.db
        .prepare(
          `SELECT ${selectSourceColumns(includeGrantId)} FROM sources WHERE id = ?`,
        )
        .get(sourceId) as SourceRow | null
    },

    removeSource(sourceId: string): void {
      const existing = deps.db
        .prepare('SELECT id FROM sources WHERE id = ?')
        .get(sourceId)
      if (!existing) {
        throw new CtxindexNotFoundError(`source not found: "${sourceId}"`)
      }
      // Removing a source purges its index footprint (SPEC §6: extracted text /
      // chunks / metadata are rebuildable from the canonical source). The index
      // spans core tables plus adapter-owned tables (SPEC §8), so rather than
      // hardcode adapter table names in core we delete the source row, then
      // sweep FK-orphaned rows to a fixed point with foreign keys deferred.
      const cascade = collectForeignKeyEdges(deps.db)
      const remove = deps.db.transaction(() => {
        deps.db.prepare('PRAGMA defer_foreign_keys = ON').run()
        deps.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
        for (let pass = 0; pass < MAX_CASCADE_PASSES; pass++) {
          let removed = 0
          for (const edge of cascade) {
            removed += deps.db
              .prepare(
                `DELETE FROM "${edge.table}"
                 WHERE "${edge.column}" IS NOT NULL
                   AND "${edge.column}" NOT IN (SELECT "${edge.refColumn}" FROM "${edge.refTable}")`,
              )
              .run().changes
          }
          if (removed === 0) break
        }
      })
      remove()
      deps.logger.debug({ sourceId }, 'source removed')
    },

    bindGrantToSource(sourceId: string, grantId: string): void {
      const existing = deps.db
        .prepare('SELECT id FROM sources WHERE id = ?')
        .get(sourceId)
      if (!existing) {
        throw new CtxindexNotFoundError(`source not found: "${sourceId}"`)
      }
      if (!hasColumn(deps, 'sources', 'grant_id')) return
      deps.db
        .prepare('UPDATE sources SET grant_id = ? WHERE id = ?')
        .run(grantId, sourceId)
      deps.logger.debug({ sourceId, grantId }, 'source grant bound')
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
        SELECT sss.source_id AS sourceId,
               s.adapter_id AS adapterId,
               r.slug AS realmSlug,
               sss.last_status AS lastStatus,
               sr.completed_at AS lastRunAt,
               sr.errors_count AS errorsCount,
               sss.cursor_json AS cursorJson,
               sr.error_json AS errorJson
        FROM source_sync_state sss
        JOIN sources s ON s.id = sss.source_id
        JOIN realms r ON r.id = s.realm_id
        LEFT JOIN sync_runs sr ON sr.id = sss.last_run_id
      `
      const rows = input.sourceId
        ? (deps.db
            .prepare(`${base} WHERE sss.source_id = ?`)
            .all(input.sourceId) as StatusDbRow[])
        : (deps.db
            .prepare(`${base} ORDER BY sss.updated_at DESC`)
            .all() as StatusDbRow[])

      return rows.map((row) => ({
        sourceId: row.sourceId,
        adapterId: row.adapterId,
        realmSlug: row.realmSlug,
        lastStatus: row.lastStatus,
        lastRunAt: row.lastRunAt,
        errorsCount: row.errorsCount ?? 0,
        lastError: parseLastError(row.errorJson),
        cursor: parseCursor(row.cursorJson),
      }))
    },
  }
}
