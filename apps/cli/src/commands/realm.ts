import type { CtxindexDatabase } from '@ctxindex/core/storage'
import { ulid } from 'ulid'

interface RealmRow {
  id: string
  slug: string
  is_default: number
  created_at: number
}

export function realmAdd(db: CtxindexDatabase, slug: string): void {
  const existing = db.prepare('SELECT id FROM realms WHERE slug = ?').get(slug)
  if (existing) {
    throw new Error(`realm already exists: "${slug}"`)
  }
  db.prepare(
    'INSERT INTO realms (id, slug, is_default, created_at) VALUES (?, ?, 0, ?)',
  ).run(ulid(), slug, Date.now())
}

export function realmList(db: CtxindexDatabase): RealmRow[] {
  return db
    .prepare(
      'SELECT id, slug, is_default, created_at FROM realms ORDER BY slug',
    )
    .all() as RealmRow[]
}
