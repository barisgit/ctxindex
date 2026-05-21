import type { CtxindexDatabase } from '@ctxindex/core/storage'
import { ulid } from 'ulid'

interface SourceRow {
  id: string
  realm_id: string
  adapter_id: string
  display_name: string | null
  config_json: string | null
  created_at: number
}

export function sourceAdd(
  db: CtxindexDatabase,
  adapterId: string,
  opts: { realmSlug?: string; displayName?: string; configJson?: string } = {},
): string {
  const slug = opts.realmSlug ?? 'global'
  const realm = db
    .prepare('SELECT id FROM realms WHERE slug = ?')
    .get(slug) as { id: string } | null
  if (!realm) {
    throw Object.assign(
      new Error(
        `unknown realm "${slug}"; create it with: ctxindex realm add ${slug}`,
      ),
      { code: 'UNKNOWN_REALM', exitCode: 2 },
    )
  }
  const id = ulid()
  db.prepare(
    `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    realm.id,
    adapterId,
    opts.displayName ?? null,
    opts.configJson ?? null,
    Date.now(),
  )
  return id
}

export function sourceList(
  db: CtxindexDatabase,
  realmSlug?: string,
): SourceRow[] {
  if (realmSlug) {
    return db
      .prepare(
        `SELECT s.id, s.realm_id, s.adapter_id, s.display_name, s.config_json, s.created_at
       FROM sources s JOIN realms r ON r.id = s.realm_id
       WHERE r.slug = ? ORDER BY s.created_at`,
      )
      .all(realmSlug) as SourceRow[]
  }
  return db
    .prepare(
      'SELECT id, realm_id, adapter_id, display_name, config_json, created_at FROM sources ORDER BY created_at',
    )
    .all() as SourceRow[]
}

export function sourceRemove(db: CtxindexDatabase, sourceId: string): void {
  const existing = db
    .prepare('SELECT id FROM sources WHERE id = ?')
    .get(sourceId)
  if (!existing)
    throw Object.assign(new Error(`source not found: "${sourceId}"`), {
      exitCode: 2,
    })
  db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
}
