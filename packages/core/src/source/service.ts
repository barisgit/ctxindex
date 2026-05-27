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
}

function parseCursor(cursorJson: string | null): unknown {
  return cursorJson === null ? null : JSON.parse(cursorJson)
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
      const columns = selectSourceColumns(includeGrantId)
      if (input.realmSlug) {
        return deps.db
          .prepare(
            `SELECT s.${columns.split(', ').join(', s.')}
             FROM sources s JOIN realms r ON r.id = s.realm_id
             WHERE r.slug = ? ORDER BY s.created_at`,
          )
          .all(input.realmSlug) as SourceRow[]
      }
      return deps.db
        .prepare(`SELECT ${columns} FROM sources ORDER BY created_at`)
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
      deps.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
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
      const base = `
        SELECT sss.source_id AS sourceId,
               s.adapter_id AS adapterId,
               r.slug AS realmSlug,
               sss.last_status AS lastStatus,
               sr.completed_at AS lastRunAt,
               sr.errors_count AS errorsCount,
               sss.cursor_json AS cursorJson
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
        cursor: parseCursor(row.cursorJson),
      }))
    },
  }
}
