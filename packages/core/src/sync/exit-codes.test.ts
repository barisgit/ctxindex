import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { ulid } from 'ulid'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { EXIT_CODES } from './exit-codes'
import { runSync } from './runner'

let db: Database

function insertRealm(d: Database): string {
  d.prepare(
    'INSERT OR IGNORE INTO realms (id, slug, is_default, created_at) VALUES (?, ?, 1, ?)',
  ).run('global', 'global', Date.now())
  return 'global'
}

function insertSource(d: Database, realmId: string): string {
  const id = ulid()
  d.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, realmId, 'local.directory', Date.now())
  return id
}

function errorAdapter(code: string) {
  return {
    sync: async function* () {
      if (Date.now() < 0) yield { type: 'never' }
      throw Object.assign(new Error(`adapter error: ${code}`), { code })
    },
  }
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

test('completed sync with errors_count > 0 exits 0 (partial success)', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  const partialAdapter = {
    sync: async function* () {
      yield { type: 'item_added' }
      yield { type: 'error', message: 'partial failure' }
      yield { type: 'item_added' }
    },
  }

  const result = await runSync(db, { sourceId, adapter: partialAdapter })
  expect(result.status).toBe('completed')
  expect(result.exitCode).toBe(EXIT_CODES.OK)
  expect(result.errorsCount).toBe(1)
  expect(result.itemsAdded).toBe(2)

  const run = db
    .prepare('SELECT status, errors_count FROM sync_runs WHERE id = ?')
    .get(result.runId) as { status: string; errors_count: number }
  expect(run.status).toBe('completed')
  expect(run.errors_count).toBe(1)
})

test('needs_auth error → exit 10, run failed, last_status needs_auth', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('needs_auth'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.NEEDS_AUTH)
  expect(result.status).toBe('failed')

  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('needs_auth')
})

test('rate_limited → exit 20', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)
  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('rate_limited'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.RATE_LIMITED)
})

test('network_error → exit 30', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)
  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('network_error'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.NETWORK_ERROR)
})

test('permission_denied → exit 40, last_status disabled', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)
  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('permission_denied'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.PERMISSION_DENIED)

  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('disabled')
})

test('cancelled → exit 130, run status cancelled', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)
  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('cancelled'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.CANCELLED)
  expect(result.status).toBe('cancelled')
})

test('unknown error → exit 50', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)
  const result = await runSync(db, {
    sourceId,
    adapter: errorAdapter('something_weird'),
  })
  expect(result.exitCode).toBe(EXIT_CODES.OTHER_FAILURE)
})

test('sync busy (lock held by live run) → exit 50, creates cancelled run', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  // Plant an active lock with a running sync_run
  const activeRunId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, ?, 'sync', 'running', ?)`,
  ).run(activeRunId, sourceId, realmId, Date.now())
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(activeRunId, Date.now())

  const result = await runSync(db, {
    sourceId,
    adapter: { sync: async function* () {} },
  })
  expect(result.exitCode).toBe(EXIT_CODES.OTHER_FAILURE)
  expect(result.status).toBe('cancelled')

  // The cancelled run should be recorded
  const run = db
    .prepare('SELECT status FROM sync_runs WHERE id = ?')
    .get(result.runId) as { status: string }
  expect(run.status).toBe('cancelled')
})

test('cursor is not advanced on failure', async () => {
  const realmId = insertRealm(db)
  const sourceId = insertSource(db, realmId)

  // Seed existing cursor
  db.prepare(
    `INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'idle', ?, ?)`,
  ).run(sourceId, JSON.stringify({ page: 3 }), Date.now())

  await runSync(db, { sourceId, adapter: errorAdapter('network_error') })

  const state = db
    .prepare('SELECT cursor_json FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { cursor_json: string }
  // Cursor must not be advanced
  expect(state.cursor_json).toBe(JSON.stringify({ page: 3 }))
})
