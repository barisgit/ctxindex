import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dataDir } from '../paths'
import { normalizeStorageError } from './contention'

export type CtxindexDatabase = Database

export function databasePath(): string {
  return join(dataDir(), 'ctxindex.sqlite')
}

export async function openDatabase(
  path: string = databasePath(),
): Promise<CtxindexDatabase> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  let database: Database | undefined
  try {
    database = new Database(path, { create: true })
    applyPragmas(database)
    return database
  } catch (error) {
    database?.close()
    normalizeStorageError(error)
  }
}

export function openReadonlyDatabase(path: string): CtxindexDatabase {
  let database: Database | undefined
  try {
    database = new Database(path, { readonly: true, strict: true })
    database.exec('PRAGMA busy_timeout = 5000;')
    return database
  } catch (error) {
    database?.close()
    normalizeStorageError(error)
  }
}

export function applyPragmas(database: CtxindexDatabase): void {
  try {
    database.exec('PRAGMA busy_timeout = 5000;')
    database.exec('PRAGMA journal_mode = WAL;')
    database.exec('PRAGMA foreign_keys = ON;')
    database.exec('PRAGMA synchronous = NORMAL;')
  } catch (error) {
    normalizeStorageError(error)
  }
}
