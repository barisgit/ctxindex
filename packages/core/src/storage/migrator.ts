import { coreMigrations } from '../migrations/index'
import { normalizeStorageError } from './contention'
import type { CtxindexDatabase } from './db'

/** Run the core-owned schema on a fresh or already-current database. */
export async function runMigrations(db: CtxindexDatabase): Promise<void> {
  try {
    runMigrationsUnchecked(db)
  } catch (error) {
    normalizeStorageError(error)
  }
}

function runMigrationsUnchecked(db: CtxindexDatabase): void {
  if (migrationsAreCurrent(db)) return

  if (db.inTransaction) {
    db.transaction(() => applyPendingMigrations(db))()
    return
  }

  let began = false
  try {
    db.exec('BEGIN IMMEDIATE')
    began = true
    applyPendingMigrations(db)
    db.exec('COMMIT')
  } catch (error) {
    if (began && db.inTransaction) db.exec('ROLLBACK')
    throw error
  }
}

function migrationsAreCurrent(db: CtxindexDatabase): boolean {
  const migrationTableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(coreMigrations.migrationsTable)
  if (!migrationTableExists) return false
  assertNotPrototypeDatabase(db)
  const applied = new Set(
    (
      db
        .prepare(`SELECT name FROM "${coreMigrations.migrationsTable}"`)
        .all() as { name: string }[]
    ).map((row) => row.name),
  )
  return coreMigrations.migrations.every((migration) =>
    applied.has(migration.name),
  )
}

function assertNotPrototypeDatabase(db: CtxindexDatabase): void {
  const prototypeMarker = db
    .prepare(
      `SELECT 1 FROM "${coreMigrations.migrationsTable}" WHERE name = '0000_init.sql'`,
    )
    .get()
  const v1SchemaExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'resources'",
    )
    .get()
  if (prototypeMarker && !v1SchemaExists) {
    throw new Error(
      'Prototype database detected: ctxindex_migrations_core records 0000_init.sql but the V1 resources table is missing; delete or move this database and initialize a fresh one',
    )
  }
}

function applyPendingMigrations(db: CtxindexDatabase): void {
  const migrationTableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(coreMigrations.migrationsTable)
  if (migrationTableExists) assertNotPrototypeDatabase(db)
  if (!migrationTableExists) {
    const existingUserTable = db
      .prepare(
        `
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        LIMIT 1
      `,
      )
      .get() as { name: string } | null
    if (existingUserTable) {
      throw new Error(
        `V1 storage requires a fresh database; found existing table "${existingUserTable.name}"`,
      )
    }
  }
  if (!migrationTableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "${coreMigrations.migrationsTable}" (
        idx INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      )
    `)
  }

  const applied = new Set(
    (
      db
        .prepare(`SELECT name FROM "${coreMigrations.migrationsTable}"`)
        .all() as {
        name: string
      }[]
    ).map((row) => row.name),
  )

  for (const migration of coreMigrations.migrations) {
    if (applied.has(migration.name)) continue
    db.exec(migration.sql)
    db.prepare(
      `INSERT INTO "${coreMigrations.migrationsTable}" (name, applied_at) VALUES (?, ?)`,
    ).run(migration.name, Date.now())
  }
}
