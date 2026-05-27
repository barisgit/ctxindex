import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import {
  googleMailboxMigrations,
  localDirectoryMigrations,
} from '@ctxindex/adapters'
import { applyPragmas } from './db'
import { runMigrations } from './migrator'

const dbs: Database[] = []

function freshDb(): Database {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
})

function tableNames(db: Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','shadow') ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name)
}

function columnNames(db: Database, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((r) => r.name)
}

test('core migrations create all expected tables', async () => {
  const db = freshDb()
  await runMigrations(db)

  const tables = tableNames(db)

  const expected = [
    'account_identities',
    'accounts',
    'external_refs',
    'grants',
    'item_chunks',
    'item_relations',
    'items',
    'mail_attachments',
    'mail_bodies',
    'mail_messages',
    'raw_records',
    'realms',
    'source_sync_state',
    'sources',
    'sync_locks',
    'sync_run_checkpoints',
    'sync_runs',
    'tombstones',
  ]

  for (const t of expected) {
    expect(tables, `expected table "${t}" to exist`).toContain(t)
  }
})

test('PRAGMAs match spec after migrations', async () => {
  // WAL mode requires a real file; :memory: always reports 'memory'
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const tmp = await mkdtemp(join(tmpdir(), 'ctxindex-pragma-'))
  const dbPath = join(tmp, 'test.sqlite')
  const fileDb = new Database(dbPath, { create: true })
  applyPragmas(fileDb)
  try {
    await runMigrations(fileDb)

    const val = (pragma: string): unknown => {
      const row = fileDb.prepare(`PRAGMA ${pragma}`).get() as Record<
        string,
        unknown
      >
      return Object.values(row)[0]
    }

    expect(val('journal_mode')).toBe('wal')
    expect(val('foreign_keys')).toBe(1)
    expect(Number(val('synchronous'))).toBe(1) // NORMAL = 1
    expect(Number(val('busy_timeout'))).toBeGreaterThan(0)
  } finally {
    fileDb.close()
    await rm(tmp, { recursive: true, force: true })
  }
})

test('FTS5 virtual tables exist and are queryable', async () => {
  const db = freshDb()
  await runMigrations(db)

  const vtables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'",
      )
      .all() as { name: string }[]
  ).map((r) => r.name)

  expect(vtables).toContain('items_fts')
  expect(vtables).toContain('chunks_fts')

  expect(() =>
    db.prepare("SELECT * FROM items_fts WHERE items_fts MATCH 'test'").all(),
  ).not.toThrow()
  expect(() =>
    db.prepare("SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'test'").all(),
  ).not.toThrow()
})

test('global realm seed row is present', async () => {
  const db = freshDb()
  await runMigrations(db)

  const realm = db
    .prepare("SELECT * FROM realms WHERE slug = 'global'")
    .get() as { id: string; is_default: number } | null

  expect(realm).not.toBeNull()
  expect(realm?.id).toBe('global')
  expect(realm?.is_default).toBe(1)
})

test('per-namespace migration journal tables created for all adapters', async () => {
  const db = freshDb()
  await runMigrations(db, {
    adapterMigrations: [localDirectoryMigrations, googleMailboxMigrations],
  })

  const tables = tableNames(db)

  expect(tables).toContain('ctxindex_migrations_core')
  expect(tables).toContain('ctxindex_migrations_local_directory')
  expect(tables).toContain('ctxindex_migrations_google_mailbox')
  expect(tables).toContain('local_directory_file_state')
  expect(tables).toContain('google_mailbox_sync_state')
})

test('idempotent', async () => {
  const db = freshDb()

  await runMigrations(db)
  await runMigrations(db)

  const applied = (
    db
      .prepare(
        "SELECT name FROM ctxindex_migrations_core WHERE name = '0002_grants_client_creds.sql'",
      )
      .all() as { name: string }[]
  ).map((r) => r.name)

  expect(applied).toEqual(['0002_grants_client_creds.sql'])

  const columns = columnNames(db, 'grants')
  expect(columns.filter((name) => name === 'client_id_ref')).toHaveLength(1)
  expect(columns.filter((name) => name === 'client_secret_ref')).toHaveLength(1)
})

test('credential columns', async () => {
  const db = freshDb()
  await runMigrations(db)

  const columns = columnNames(db, 'grants')

  expect(columns).toContain('client_id_ref')
  expect(columns).toContain('client_secret_ref')
})
