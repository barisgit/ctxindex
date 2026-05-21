import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { ulid } from 'ulid'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { releaseStaleGlobalLock, runSync } from './runner'

let db: Database

function insertRealm(d: Database, slug = 'global'): string {
  // Use the migration-seeded id for global realm
  const id = slug === 'global' ? 'global' : `realm-${slug}`
  d.prepare(
    'INSERT OR IGNORE INTO realms (id, slug, is_default, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, slug, slug === 'global' ? 1 : 0, Date.now())
  return id
}

function insertSource(d: Database, realmId: string): string {
  const id = ulid()
  d.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, realmId, 'local.directory', Date.now())
  return id
}

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(() => {
  try {
    db.close()
  } catch {
    /* ignore */
  }
})

test('releaseStaleGlobalLock: removes lock when run is not running', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  // Simulate a crashed sync: insert a sync_run with status='running' first,
  // then update it to 'failed' (simulating SIGKILL after crash detection)
  const runId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, ?, 'sync', 'failed', ?)`,
  ).run(runId, sourceId, realmId, Date.now() - 10000)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(runId, Date.now() - 10000)

  // Confirm the stale lock is present
  const before = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(before).not.toBeNull()

  // Release the stale lock
  const released = releaseStaleGlobalLock(db)
  expect(released).toBe(true)

  // Lock should be gone
  const after = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(after).toBeNull()
})

test('runSync auto-releases stale lock and proceeds', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  // Plant stale lock from a prior 'failed' run
  const staleRunId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at, completed_at)
     VALUES (?, ?, ?, 'sync', 'failed', ?, ?)`,
  ).run(staleRunId, sourceId, realmId, Date.now() - 60000, Date.now() - 59000)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(staleRunId, Date.now() - 60000)

  // New sync should succeed despite stale lock
  const noop = { sync: async function* () {} }
  const result = await runSync(db, { sourceId, adapter: noop })

  expect(result.status).toBe('completed')
  expect(result.exitCode).toBe(0)

  // Lock released after run
  const lock = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(lock).toBeNull()

  // source_sync_state updated to idle
  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string } | null
  expect(state?.last_status).toBe('idle')
})

test('runSync does not corrupt source_sync_state on stale lock recovery', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  // Seed existing sync state with a cursor
  db.prepare(
    `INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at)
     VALUES (?, 'idle', ?, ?)`,
  ).run(sourceId, JSON.stringify({ page: 5 }), Date.now() - 1000)

  // Plant stale lock
  const staleRunId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, ?, 'sync', 'cancelled', ?)`,
  ).run(staleRunId, sourceId, realmId, Date.now() - 30000)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(staleRunId, Date.now() - 30000)

  const noop = { sync: async function* () {} }
  const result = await runSync(db, { sourceId, adapter: noop })

  expect(result.status).toBe('completed')

  // Cursor should still be accessible (noop adapter emits no cursor op, so it stays)
  const state = db
    .prepare('SELECT cursor_json FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { cursor_json: string } | null
  expect(state?.cursor_json).toBe(JSON.stringify({ page: 5 }))
})
