import type { CtxindexDatabase } from '@ctxindex/core/storage'

interface StatusRow {
  source_id: string
  adapter_id: string
  realm_slug: string
  last_status: string
  updated_at: number
}

export function getStatus(
  db: CtxindexDatabase,
  sourceId?: string,
): StatusRow[] {
  const base = `
    SELECT sss.source_id, s.adapter_id, r.slug AS realm_slug,
           sss.last_status, sss.updated_at
    FROM source_sync_state sss
    JOIN sources s ON s.id = sss.source_id
    JOIN realms r ON r.id = s.realm_id
  `
  if (sourceId) {
    return db
      .prepare(`${base} WHERE sss.source_id = ?`)
      .all(sourceId) as StatusRow[]
  }
  return db.prepare(`${base} ORDER BY sss.updated_at DESC`).all() as StatusRow[]
}
