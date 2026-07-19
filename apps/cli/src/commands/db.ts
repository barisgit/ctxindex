import { configPath } from '@ctxindex/core/config'
import { CtxindexError } from '@ctxindex/core/errors'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  databasePath,
  openDatabase,
  runMigrations,
} from '@ctxindex/core/storage'

let _db: CtxindexDatabase | null = null

export async function assertInitialized(): Promise<void> {
  if (await Bun.file(configPath()).exists()) return
  throw new CtxindexError(
    'ctxindex is not initialized; run bun cli init',
    'invalid_args',
  )
}

export async function getDb(): Promise<CtxindexDatabase> {
  if (_db) return _db
  await assertInitialized()
  const db = await openDatabase(databasePath())
  await runMigrations(db)
  _db = db
  return db
}
