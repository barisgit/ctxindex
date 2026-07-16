import { coreMigrations } from '../migrations/index'
import type { CtxindexDatabase } from './db'

/** Run the core-owned schema on a fresh or already-current database. */
export async function runMigrations(db: CtxindexDatabase): Promise<void> {
  const migrationTableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(coreMigrations.migrationsTable)
  if (migrationTableExists) {
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
  if (!migrationTableExists) {
    const existingUserTable = db
      .prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        LIMIT 1
      `)
      .get() as { name: string } | null
    if (existingUserTable) {
      throw new Error(
        `V1 storage requires a fresh database; found existing table "${existingUserTable.name}"`,
      )
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${coreMigrations.migrationsTable}" (
      idx INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

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
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare(
        `INSERT INTO "${coreMigrations.migrationsTable}" (name, applied_at) VALUES (?, ?)`,
      ).run(migration.name, Date.now())
    })()
  }
}
