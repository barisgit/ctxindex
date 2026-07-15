import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  databasePath,
  openDatabase,
  runMigrations,
} from '@ctxindex/core/storage'

let _db: CtxindexDatabase | null = null

export async function getDb(): Promise<CtxindexDatabase> {
  if (_db) return _db
  const db = await openDatabase(databasePath())
  await runMigrations(db)
  _db = db
  return db
}
