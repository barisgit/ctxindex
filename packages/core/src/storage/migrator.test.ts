import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { CtxindexError } from '../errors'
import { sources } from '../schema/sources'
import { syncRuns } from '../schema/sync_runs'
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

test('refuses the prototype 0000 marker without the V1 schema', async () => {
  const db = freshDb()
  db.exec(`
    CREATE TABLE ctxindex_migrations_core (
      idx INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
    INSERT INTO ctxindex_migrations_core (name, applied_at)
    VALUES ('0000_init.sql', 1);
    CREATE TABLE items (id TEXT PRIMARY KEY);
  `)

  await expect(runMigrations(db)).rejects.toThrow(
    'Prototype database detected: ctxindex_migrations_core records 0000_init.sql but the V1 resources table is missing; delete or move this database and initialize a fresh one',
  )
  expect(tableNames(db)).not.toContain('resources')
})

test('normalizes contention while creating migration state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ctxindex-migration-busy-'))
  const path = join(directory, 'ctxindex.sqlite')
  const holder = new Database(path, { create: true })
  const contender = new Database(path, { create: true })
  try {
    applyPragmas(holder)
    applyPragmas(contender)
    contender.exec('PRAGMA busy_timeout = 10')
    holder.exec('BEGIN IMMEDIATE')

    let caught: unknown
    try {
      await runMigrations(contender)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CtxindexError)
    expect(caught).toMatchObject({
      code: 'storage_busy',
      cause: expect.any(Error),
    })
    expect((caught as Error).message).toContain('try again')
    expect((caught as Error).message).not.toMatch(/SQLITE|database.*lock|busy/i)
  } finally {
    if (holder.inTransaction) holder.exec('ROLLBACK')
    contender.close()
    holder.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('current migration state remains read-only while another writer is active', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ctxindex-migration-current-'))
  const path = join(directory, 'ctxindex.sqlite')
  const holder = new Database(path, { create: true })
  const current = new Database(path, { create: true })
  try {
    applyPragmas(holder)
    applyPragmas(current)
    await runMigrations(holder)
    current.exec('PRAGMA busy_timeout = 10')
    holder.exec('BEGIN IMMEDIATE')

    await expect(runMigrations(current)).resolves.toBeUndefined()
  } finally {
    if (holder.inTransaction) holder.exec('ROLLBACK')
    current.close()
    holder.close()
    await rm(directory, { recursive: true, force: true })
  }
})

function tableNames(db: Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','shadow') ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name)
}

test('fresh core migration creates only the generic V1 storage model', async () => {
  const db = freshDb()
  await runMigrations(db)

  const tables = tableNames(db)
  for (const table of [
    'account_identities',
    'accounts',
    'artifacts',
    'chunks',
    'field_index',
    'grants',
    'realms',
    'relation_resolutions',
    'relations',
    'resources',
    'source_sync_state',
    'sources',
    'sync_locks',
    'sync_run_checkpoints',
    'sync_runs',
  ]) {
    expect(tables, `expected table "${table}" to exist`).toContain(table)
  }

  for (const obsolete of [
    'external_refs',
    'item_chunks',
    'item_relations',
    'items',
    'mail_attachments',
    'mail_bodies',
    'mail_messages',
    'google_mailbox_state',
    'local_directory_file_state',
    'raw_records',
    'tombstones',
  ]) {
    expect(
      tables,
      `expected prototype table "${obsolete}" to be absent`,
    ).not.toContain(obsolete)
  }

  expect(db.prepare('SELECT count(*) AS count FROM realms').get()).toEqual({
    count: 0,
  })
  expect(
    db
      .prepare("SELECT name FROM pragma_table_info('sources') ORDER BY cid")
      .all(),
  ).not.toContainEqual({ name: 'adapter_version' })
  db.prepare(
    "INSERT INTO realms (id, slug, created_at) VALUES ('realm-1', 'work', 1)",
  ).run()
  db.prepare(
    `INSERT INTO sources (
       id, realm_id, label, adapter_id, config_json, created_at,
       updated_at
     ) VALUES ('source-1', 'realm-1', 'Fixture Source', 'fixture.adapter', '{}', 1, 1)`,
  ).run()
  expect(() =>
    db
      .prepare(
        "INSERT INTO source_sync_state (source_id, last_status, updated_at) VALUES ('source-1', 'extension_unavailable', 1)",
      )
      .run(),
  ).toThrow()
  expect(
    db.prepare("SELECT name, pk FROM pragma_table_info('sync_locks')").all(),
  ).toEqual([
    { name: 'scope', pk: 1 },
    { name: 'run_id', pk: 0 },
    { name: 'owner_pid', pk: 0 },
    { name: 'acquired_at', pk: 0 },
  ])
  expect(
    db
      .prepare(
        "SELECT name FROM pragma_table_info('sync_runs') WHERE name IN ('warnings_count', 'last_warning_json') ORDER BY cid",
      )
      .all(),
  ).toEqual([{ name: 'warnings_count' }, { name: 'last_warning_json' }])
  expect(
    db
      .prepare(
        "SELECT name FROM pragma_table_info('source_sync_state') WHERE name IN ('warnings_count', 'last_warning_json', 'errors_count', 'last_error_json') ORDER BY cid",
      )
      .all(),
  ).toEqual([
    { name: 'warnings_count' },
    { name: 'last_warning_json' },
    { name: 'errors_count' },
    { name: 'last_error_json' },
  ])
})

test('fresh Account schema requires stable provider identity and enforces its uniqueness', async () => {
  const db = freshDb()
  await runMigrations(db)

  const columns = db.prepare("PRAGMA table_info('accounts')").all() as Array<{
    name: string
    notnull: number
  }>
  expect(
    columns.find((column) => column.name === 'external_user_id')?.notnull,
  ).toBe(1)

  db.prepare(
    "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('one', 'google', 'Google One', 'subject', 1, 1)",
  ).run()
  expect(() =>
    db
      .prepare(
        "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('two', 'google', 'Google Two', 'subject', 1, 1)",
      )
      .run(),
  ).toThrow()
  expect(() =>
    db
      .prepare(
        "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('three', 'microsoft', 'Microsoft Three', 'subject', 1, 1)",
      )
      .run(),
  ).not.toThrow()
  expect(() =>
    db
      .prepare(
        "INSERT INTO accounts (id, provider, label, created_at, updated_at) VALUES ('missing', 'google', 'Missing Account', 1, 1)",
      )
      .run(),
  ).toThrow()
})

test('field index enforces one typed value and ordered uniqueness', async () => {
  const db = freshDb()
  await runMigrations(db)

  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.exec(
    "INSERT INTO sources (id, realm_id, label, adapter_id, config_json, created_at, updated_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'personal', 'Field Index Source', 'fake', '{}', 1, 1)",
  )
  db.exec(
    "INSERT INTO resources (id, ref, source_id, realm_id, profile_id, profile_version, origin, created_at, updated_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAW', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/a', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'personal', 'fake.record', 1, 'synced', 1, 1)",
  )

  const insert = db.prepare(
    "INSERT INTO field_index (id, resource_id, field, declared_type, ordinal, value_text, value_number, value_integer) VALUES (?, '01ARZ3NDEKTSV4RRFFQ69G5FAW', 'name', 'string', 0, ?, ?, ?)",
  )
  expect(() =>
    insert.run('01ARZ3NDEKTSV4RRFFQ69G5FAX', 'Ada', null, null),
  ).not.toThrow()
  expect(() =>
    insert.run('01ARZ3NDEKTSV4RRFFQ69G5FAY', 'Grace', null, null),
  ).toThrow()
  expect(() =>
    insert.run('01ARZ3NDEKTSV4RRFFQ69G5FAZ', 'Ada', 1, null),
  ).toThrow()
})

test('generic FTS tables are queryable', async () => {
  const db = freshDb()
  await runMigrations(db)

  expect(() =>
    db
      .prepare("SELECT * FROM resources_fts WHERE resources_fts MATCH 'test'")
      .all(),
  ).not.toThrow()
  expect(() =>
    db.prepare("SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'test'").all(),
  ).not.toThrow()
})

test('Resource FTS retains tombstone envelopes and removes hard-deleted rows', async () => {
  const db = freshDb()
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.exec(
    "INSERT INTO sources (id, realm_id, label, adapter_id, config_json, created_at, updated_at) VALUES ('source', 'personal', 'Retention Source', 'fake', '{}', 1, 1)",
  )
  db.exec(
    "INSERT INTO resources (id, ref, source_id, realm_id, profile_id, profile_version, title, summary, origin, created_at, updated_at) VALUES ('resource', 'ctx://source/one', 'source', 'personal', 'fake.record', 1, 'Retained title', 'Retained summary', 'synced', 1, 1)",
  )
  db.exec(
    "INSERT INTO chunks (id, resource_id, chunk_index, content, created_at) VALUES ('chunk', 'resource', 0, 'Removed payload text', 1)",
  )

  db.exec("DELETE FROM chunks WHERE resource_id = 'resource'")
  db.exec("UPDATE resources SET deleted_at = 2 WHERE id = 'resource'")

  expect(
    db
      .prepare(
        "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'Retained'",
      )
      .get(),
  ).toEqual({ count: 1 })
  expect(
    db
      .prepare(
        "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'summary'",
      )
      .get(),
  ).toEqual({ count: 1 })
  expect(
    db
      .prepare(
        "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'Removed'",
      )
      .get(),
  ).toEqual({ count: 0 })

  db.exec("DELETE FROM sources WHERE id = 'source'")
  expect(
    db
      .prepare(
        "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'Retained'",
      )
      .get(),
  ).toEqual({ count: 0 })
})

test('PRAGMAs match spec after migrations', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const tmp = await mkdtemp(join(tmpdir(), 'ctxindex-pragma-'))
  const fileDb = new Database(join(tmp, 'test.sqlite'), { create: true })
  applyPragmas(fileDb)
  try {
    await runMigrations(fileDb)
    const value = (pragma: string): unknown => {
      const row = fileDb.prepare(`PRAGMA ${pragma}`).get() as Record<
        string,
        unknown
      >
      return Object.values(row)[0]
    }
    expect(value('journal_mode')).toBe('wal')
    expect(value('foreign_keys')).toBe(1)
    expect(Number(value('synchronous'))).toBe(1)
    expect(Number(value('busy_timeout'))).toBeGreaterThan(0)
  } finally {
    fileDb.close()
    await rm(tmp, { recursive: true, force: true })
  }
})

test('refuses to migrate a prototype database', async () => {
  const db = freshDb()
  db.exec('CREATE TABLE items (id TEXT PRIMARY KEY)')

  await expect(runMigrations(db)).rejects.toThrow('fresh database')
  expect(tableNames(db)).not.toContain('resources')
})

test('fresh migration is idempotent', async () => {
  const db = freshDb()
  await runMigrations(db)
  await runMigrations(db)

  expect(
    db
      .prepare(
        "SELECT name FROM ctxindex_migrations_core WHERE name = '0000_init.sql'",
      )
      .all(),
  ).toEqual([{ name: '0000_init.sql' }])
})

test('fresh Artifact schema enforces ownership, stable refs, retention, and hash indexing', async () => {
  const db = freshDb()
  await runMigrations(db)
  db.exec(`
    INSERT INTO realms (id, slug, created_at) VALUES ('realm', 'test', 1);
    INSERT INTO sources (
      id, realm_id, label, adapter_id, config_json, created_at, updated_at
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'realm', 'Artifact Source', 'fake', '{}', 1, 1
    );
    INSERT INTO resources (
      id, ref, source_id, realm_id, profile_id, profile_version, origin,
      created_at, updated_at
    ) VALUES (
      'resource', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item',
      '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'realm', 'fake', 1, 'synced', 1, 1
    );
    INSERT INTO artifacts (
      id, ref, resource_id, origin_ref, content_hash, media_type, byte_size,
      retention_class, local_path, created_at
    ) VALUES (
      'one', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/a', 'resource',
      'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item', 'sha256:${'a'.repeat(64)}',
      'text/plain', 1, 'cached', 'sha256/aa/${'a'.repeat(64)}', 1
    );
    INSERT INTO artifacts (
      id, ref, resource_id, origin_ref, content_hash, media_type, byte_size,
      retention_class, local_path, created_at
    ) VALUES (
      'two', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/b', 'resource',
      'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item', 'sha256:${'a'.repeat(64)}',
      'text/plain', 1, 'cached', 'sha256/aa/${'a'.repeat(64)}', 1
    );
  `)

  const indexes = db.prepare("PRAGMA index_list('artifacts')").all() as Array<{
    name: string
    unique: number
    origin: string
    partial: number
    seq: number
  }>
  expect(indexes).toContainEqual({
    name: 'artifacts_content_hash_idx',
    unique: 0,
    origin: 'c',
    partial: 0,
    seq: expect.any(Number),
  })
  const uniqueColumns = indexes
    .filter((index) => index.unique === 1)
    .map((index) =>
      (
        db.prepare(`PRAGMA index_info('${index.name}')`).all() as Array<{
          name: string
        }>
      ).map((column) => column.name),
    )
  expect(uniqueColumns).not.toContainEqual(['content_hash', 'local_path'])
  expect(() =>
    db
      .prepare(
        `INSERT INTO artifacts (
        id, ref, resource_id, origin_ref, content_hash, media_type, byte_size,
        retention_class, local_path, created_at
      ) VALUES ('bad', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/c', 'resource',
        'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item', 'sha256:${'b'.repeat(64)}',
        'text/plain', 1, 'ephemeral', 'sha256/bb/${'b'.repeat(64)}', 1)`,
      )
      .run(),
  ).toThrow()
  expect(() =>
    db
      .prepare(
        `INSERT INTO artifacts (
        id, ref, resource_id, origin_ref, content_hash, media_type, byte_size,
        retention_class, local_path, created_at
      ) VALUES ('bad-owner', 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/d', NULL,
        'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item', 'sha256:${'c'.repeat(64)}',
        'text/plain', 1, 'cached', 'sha256/cc/${'c'.repeat(64)}', 1)`,
      )
      .run(),
  ).toThrow()
})

test('canonical schema and migration agree on Source-owned sync-run cascade', async () => {
  const db = freshDb()
  await runMigrations(db)

  const migrationForeignKey = (
    db.prepare('PRAGMA foreign_key_list(sync_runs)').all() as Array<{
      from: string
      table: string
      to: string
      on_delete: string
    }>
  ).find((foreignKey) => foreignKey.from === 'source_id')
  expect(migrationForeignKey).toMatchObject({
    table: 'sources',
    to: 'id',
    on_delete: 'CASCADE',
  })

  const schemaForeignKey = getTableConfig(syncRuns).foreignKeys.find(
    (foreignKey) => foreignKey.reference().columns[0]?.name === 'source_id',
  )
  expect(schemaForeignKey?.onDelete).toBe('cascade')
  expect(schemaForeignKey?.reference().foreignColumns[0]?.name).toBe('id')
  expect(schemaForeignKey?.reference().foreignTable).toBe(sources)
})
