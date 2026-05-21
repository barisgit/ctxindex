import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { coreMigrations } from '../migrations/index'
import type { CtxindexDatabase } from './db'

export interface AdapterMigrations {
  readonly namespace: string
  readonly migrationsFolder: string
  readonly migrationsTable: string
}

export interface MigratorOptions {
  /** Adapter migrations applied after core, sorted by namespace. */
  adapterMigrations?: AdapterMigrations[]
}

async function getMigrationFiles(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder)
    return entries
      .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
      .sort()
  } catch {
    return []
  }
}

async function applyNamespace(
  db: CtxindexDatabase,
  ns: AdapterMigrations,
): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${ns.migrationsTable}" (
      idx   INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set<string>(
    (
      db.prepare(`SELECT name FROM "${ns.migrationsTable}"`).all() as {
        name: string
      }[]
    ).map((r) => r.name),
  )

  const files = await getMigrationFiles(ns.migrationsFolder)

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(ns.migrationsFolder, file), 'utf8')
    db.exec(sql)
    db.prepare(
      `INSERT INTO "${ns.migrationsTable}" (name, applied_at) VALUES (?, ?)`,
    ).run(file, Date.now())
  }
}

/**
 * Run core migrations then each adapter's migrations in namespace-sort order.
 */
export async function runMigrations(
  db: CtxindexDatabase,
  options: MigratorOptions = {},
): Promise<void> {
  // Core first
  await applyNamespace(db, coreMigrations)

  // Adapters in sorted namespace order
  const adapters = [...(options.adapterMigrations ?? [])].sort((a, b) =>
    a.namespace.localeCompare(b.namespace),
  )
  for (const am of adapters) {
    await applyNamespace(db, am)
  }
}
