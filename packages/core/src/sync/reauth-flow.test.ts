/**
 * VAL-REAUTH-NEEDS-AUTH test.
 *
 * Tests that:
 * 1. invalid_grant mid-sync sets sync_runs.status='failed', last_status='needs_auth', exit 10
 * 2. After simulated auth refresh (new cursor installed), next sync resumes from prior cursor
 */
import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { ulid } from 'ulid'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { EXIT_CODES } from './exit-codes'
import { runSync } from './runner'

let db: Database

function seedGlobalRealmAndSource(d: Database): {
  realmId: string
  sourceId: string
} {
  d.prepare(
    "INSERT OR IGNORE INTO realms (id, slug, is_default, created_at) VALUES ('global', 'global', 1, ?)",
  ).run(Date.now())
  const sourceId = ulid()
  d.prepare(
    "INSERT INTO sources (id, realm_id, adapter_id, created_at) VALUES (?, 'global', 'google.mailbox', ?)",
  ).run(sourceId, Date.now())
  return { realmId: 'global', sourceId }
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

test('invalid_grant mid-sync → exit 10, run failed, last_status needs_auth', async () => {
  const { sourceId } = seedGlobalRealmAndSource(db)

  // Adapter that simulates an invalid_grant error mid-sync
  const reauthAdapter = {
    sync: async function* () {
      yield { type: 'item_added' }
      throw Object.assign(new Error('invalid_grant: token has been revoked'), {
        code: 'invalid_grant',
      })
    },
  }

  const result = await runSync(db, { sourceId, adapter: reauthAdapter })

  expect(result.exitCode).toBe(EXIT_CODES.NEEDS_AUTH)
  expect(result.status).toBe('failed')

  const run = db
    .prepare('SELECT status, errors_count FROM sync_runs WHERE id = ?')
    .get(result.runId) as { status: string; errors_count: number }
  expect(run.status).toBe('failed')

  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('needs_auth')
})

test('needs_auth code → exit 10, last_status needs_auth', async () => {
  const { sourceId } = seedGlobalRealmAndSource(db)

  const reauthAdapter = {
    sync: async function* () {
      if (Date.now() < 0) yield { type: 'never' }
      throw Object.assign(new Error('needs_auth'), { code: 'needs_auth' })
    },
  }

  const result = await runSync(db, { sourceId, adapter: reauthAdapter })

  expect(result.exitCode).toBe(EXIT_CODES.NEEDS_AUTH)
  expect(result.status).toBe('failed')

  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('needs_auth')
})

test('cursor is NOT advanced after invalid_grant failure', async () => {
  const { sourceId } = seedGlobalRealmAndSource(db)

  // Plant prior cursor
  const priorCursor = JSON.stringify({ historyId: '12345' })
  db.prepare(
    "INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'idle', ?, ?)",
  ).run(sourceId, priorCursor, Date.now())

  const reauthAdapter = {
    sync: async function* () {
      if (Date.now() < 0) yield { type: 'never' }
      throw Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' })
    },
  }

  await runSync(db, { sourceId, adapter: reauthAdapter })

  const state = db
    .prepare(
      'SELECT cursor_json, last_status FROM source_sync_state WHERE source_id = ?',
    )
    .get(sourceId) as { cursor_json: string; last_status: string }

  // Cursor must NOT be advanced
  expect(state.cursor_json).toBe(priorCursor)
  expect(state.last_status).toBe('needs_auth')
})

test('after auth refresh simulation: next sync resumes from prior cursor', async () => {
  const { sourceId } = seedGlobalRealmAndSource(db)

  // Plant prior cursor (simulates what was stored before the auth failure)
  const priorCursor = JSON.stringify({ historyId: '99999' })
  db.prepare(
    "INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'needs_auth', ?, ?)",
  ).run(sourceId, priorCursor, Date.now())

  // Simulate auth recovery: update last_status to 'idle' (what auth add google would do)
  db.prepare(
    "UPDATE source_sync_state SET last_status='idle' WHERE source_id = ?",
  ).run(sourceId)

  // Capture what cursor the adapter receives
  let receivedCursor: unknown
  const recoveryAdapter = {
    sync: async function* (ctx: {
      sourceId: string
      cursorJson: string | null
    }) {
      receivedCursor = ctx.cursorJson ? JSON.parse(ctx.cursorJson) : null
      yield { type: 'item_added' }
    },
  }

  const result = await runSync(db, { sourceId, adapter: recoveryAdapter })

  // Sync should succeed
  expect(result.exitCode).toBe(EXIT_CODES.OK)
  expect(result.status).toBe('completed')

  // Adapter received the prior cursor (not null/reset)
  expect(receivedCursor).toEqual({ historyId: '99999' })

  // State updated to idle
  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('idle')
})

test('sync busy after reauth: second sync attempt cancelled, not corrupting needs_auth state', async () => {
  const { sourceId } = seedGlobalRealmAndSource(db)

  // Set needs_auth state
  db.prepare(
    "INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'needs_auth', ?, ?)",
  ).run(sourceId, JSON.stringify({ historyId: '55555' }), Date.now())

  // Plant a live lock (another process is syncing)
  const liveRunId = ulid()
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, 'global', 'sync', 'running', ?)",
  ).run(liveRunId, sourceId, Date.now())
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(liveRunId, Date.now())

  const noop = {
    sync: async function* () {
      if (Date.now() < 0) yield { type: 'never' }
    },
  }
  const result = await runSync(db, { sourceId, adapter: noop })

  // Should report busy/cancelled, not corrupt the needs_auth state
  expect(result.exitCode).toBe(EXIT_CODES.OTHER_FAILURE)
  expect(result.status).toBe('cancelled')

  // source_sync_state must still show needs_auth (not overwritten by busy-lock path)
  const state = db
    .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
    .get(sourceId) as { last_status: string }
  expect(state.last_status).toBe('needs_auth')
})
