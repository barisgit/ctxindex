import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'
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
  await runMigrations(db, {
    adapterMigrations:
      CTXINDEX_ADAPTER_REGISTRY.listMigrations() as import('@ctxindex/core/storage').AdapterMigrations[],
  })
  _db = db
  return db
}
