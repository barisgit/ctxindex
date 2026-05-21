import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dataDir } from '../paths'

export type CtxindexDatabase = Database

export function databasePath(): string {
  return join(dataDir(), 'ctxindex.sqlite')
}

export async function openDatabase(
  path: string = databasePath(),
): Promise<CtxindexDatabase> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const database = new Database(path, { create: true })
  applyPragmas(database)
  return database
}

export function applyPragmas(database: CtxindexDatabase): void {
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA synchronous = NORMAL;')
  database.exec('PRAGMA busy_timeout = 5000;')
}
