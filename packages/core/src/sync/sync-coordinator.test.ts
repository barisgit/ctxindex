import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { defineProfile, syncError } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { CtxindexAuthError, CtxindexSyncError } from '../errors'
import { createProfileRegistry } from '../registry/profile-registry'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import {
  getSyncRunFailureDiagnostics,
  SyncCoordinator,
} from './sync-coordinator'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const otherSourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const ref = `ctx://${sourceId}/records/one`
const dbs: Database[] = []
const profile = defineProfile({
  id: 'fake.record',
  version: 1,
  schema: z.object({ title: z.string(), body: z.string() }),
  search: {
    title: (payload) => payload.title,
    chunks: (payload) => [payload.body],
  },
})

async function setup() {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, label, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sourceId, 'personal', 'fake', sourceId, '{}', 1, 1)
  db.prepare(
    "INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'idle', ?, ?)",
  ).run(sourceId, '{ "page": 1 }', 1)
  dbs.push(db)
  return {
    db,
    coordinator: new SyncCoordinator(db, createProfileRegistry([profile])),
  }
}

function resource(resourceRef = ref) {
  return {
    ref: resourceRef,
    profile: { id: 'fake.record', version: 1 },
    completeness: 'complete' as const,
    payload: { title: 'Stored', body: 'content' },
  }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

test('holds the global lock and running row throughout drive, then applies generic emissions', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async ({ cursor, emit }) => {
      expect(cursor).toEqual({ page: 1 })
      expect(
        db.prepare("SELECT scope FROM sync_locks WHERE scope = 'global'").get(),
      ).toEqual({ scope: 'global' })
      expect(db.prepare('SELECT status FROM sync_runs').get()).toEqual({
        status: 'running',
      })
      await emit({ type: 'checkpoint', cursor: { page: 2 } })
      await emit({ type: 'upsertResource', resource: resource() })
    },
  )

  expect(result).toEqual(
    expect.objectContaining({
      mode: 'sync',
      status: 'completed',
      added: 1,
      updated: 0,
      deleted: 0,
      errorsCount: 0,
      warnings: [],
    }),
  )
  expect(
    db.prepare('SELECT title, origin FROM resources WHERE ref = ?').get(ref),
  ).toEqual({ title: 'Stored', origin: 'synced' })
  expect(
    db.prepare('SELECT cursor_json, last_status FROM source_sync_state').get(),
  ).toEqual({ cursor_json: '{"page":2}', last_status: 'idle' })
  expect(
    db.prepare('SELECT cursor_json FROM sync_run_checkpoints').get(),
  ).toEqual({ cursor_json: '{"page":2}' })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('a second run is busy while the first drive is blocked', async () => {
  const { db, coordinator } = await setup()
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: () => void
  const inside = new Promise<void>((resolve) => {
    entered = resolve
  })
  const first = coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async () => {
      entered()
      await blocked
    },
  )
  await inside
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {},
    ),
  ).rejects.toEqual(
    expect.objectContaining({ code: 'unknown', message: 'sync busy' }),
  )
  expect(
    db
      .prepare(
        "SELECT status, error_summary FROM sync_runs WHERE error_summary = 'sync busy'",
      )
      .get(),
  ).toEqual({ status: 'failed', error_summary: 'sync busy' })
  release()
  await first
})

test('counts sequential duplicate upserts from each operation pre-state', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'upsertResource', resource: resource() })
      await emit({
        type: 'upsertResource',
        resource: {
          ...resource(),
          payload: { title: 'Updated', body: 'second' },
        },
      })
    },
  )

  expect(result).toEqual(
    expect.objectContaining({ added: 1, updated: 1, deleted: 0 }),
  )
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 1,
  })
})

test('counts an upsert followed by removal in emission order', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'upsertResource', resource: resource() })
      await emit({ type: 'removeResource', ref })
    },
  )

  expect(result).toEqual(
    expect.objectContaining({ added: 1, updated: 0, deleted: 1 }),
  )
  expect(
    db.prepare('SELECT deleted_at FROM resources WHERE ref = ?').get(ref),
  ).toEqual({
    deleted_at: expect.any(Number),
  })
})

test('warnings complete with separate bounded warning accounting', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "UPDATE source_sync_state SET errors_count = 1, last_error_json = 'stale error' WHERE source_id = ?",
  ).run(sourceId)
  const result = await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'warning', code: 'skip_b', message: 'second', ref })
      await emit({ type: 'warning', code: 'skip_a', message: 'first' })
    },
  )
  expect(result.errorsCount).toBe(0)
  expect(result.warningsCount).toBe(2)
  expect(result.lastWarning).toEqual({ code: 'skip_a', message: 'first' })
  expect(result.warnings).toHaveLength(2)
  expect(
    db
      .prepare(
        'SELECT status, warnings_count, last_warning_json, errors_count, error_summary FROM sync_runs',
      )
      .get(),
  ).toEqual({
    status: 'completed',
    warnings_count: 2,
    last_warning_json: JSON.stringify({
      code: 'skip_a',
      message: 'first',
    }),
    errors_count: 0,
    error_summary: null,
  })
  expect(
    db
      .prepare(
        'SELECT last_status, warnings_count, last_warning_json, errors_count, last_error_json FROM source_sync_state',
      )
      .get(),
  ).toEqual({
    last_status: 'idle',
    warnings_count: 2,
    last_warning_json: JSON.stringify({
      code: 'skip_a',
      message: 'first',
    }),
    errors_count: 0,
    last_error_json: null,
  })
})

test('reports cumulative count-only progress in validated emission order with backpressure', async () => {
  const { coordinator } = await setup()
  const events: unknown[] = []
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  let observerEntered!: () => void
  const entered = new Promise<void>((resolve) => {
    observerEntered = resolve
  })
  let secondEmissionReached = false

  const pending = coordinator.run(
    {
      sourceId,
      mode: 'sync',
      signal: new AbortController().signal,
      onProgress: async (event) => {
        events.push(event)
        if (events.length === 1) {
          observerEntered()
          await blocked
        }
      },
    },
    async ({ emit }) => {
      await emit({ type: 'upsertResource', resource: resource() })
      secondEmissionReached = true
      await emit({ type: 'checkpoint', cursor: { page: 2 } })
      await emit({ type: 'warning', code: 'partial', message: 'Partial scan' })
      await emit({ type: 'removeResource', ref })
    },
  )

  await entered
  expect(secondEmissionReached).toBe(false)
  release()
  await pending

  expect(events).toEqual([
    {
      processed: 1,
      upserts: 1,
      removals: 0,
      checkpoints: 0,
      warningsCount: 0,
    },
    {
      processed: 2,
      upserts: 1,
      removals: 0,
      checkpoints: 1,
      warningsCount: 0,
    },
    {
      processed: 3,
      upserts: 1,
      removals: 0,
      checkpoints: 1,
      warningsCount: 1,
    },
    {
      processed: 4,
      upserts: 1,
      removals: 1,
      checkpoints: 1,
      warningsCount: 1,
    },
  ])
})

test('bounds the persisted warning snapshot without changing runtime diagnostics', async () => {
  const { db, coordinator } = await setup()
  const warning = {
    code: `code-${'c'.repeat(3_000)}`,
    message: `message-${'m'.repeat(3_000)}`,
    ref: `ctx://${sourceId}/records/${'r'.repeat(3_000)}`,
  }

  const result = await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'warning', ...warning })
    },
  )

  expect(result.lastWarning).toEqual(warning)
  const persisted = db
    .prepare('SELECT last_warning_json FROM sync_runs')
    .get() as { last_warning_json: string }
  expect(JSON.parse(persisted.last_warning_json)).toEqual({
    code: warning.code.slice(0, 2_048),
    message: warning.message.slice(0, 2_048),
    ref: warning.ref.slice(0, 2_048),
  })
})

test('terminal failure preserves prior warnings and records one error', async () => {
  const { db, coordinator } = await setup()
  const error = new Error('boom')
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({
          type: 'warning',
          code: 'degraded',
          message: 'partial provider response',
          ref,
        })
        throw error
      },
    ),
  ).rejects.toThrow('boom')
  expect(getSyncRunFailureDiagnostics(error)).toEqual({
    warningsCount: 1,
    lastWarning: {
      code: 'degraded',
      message: 'partial provider response',
      ref,
    },
    errorsCount: 1,
    lastError: 'boom',
  })

  const expectedWarning = JSON.stringify({
    code: 'degraded',
    message: 'partial provider response',
    ref,
  })
  expect(
    db
      .prepare(
        'SELECT status, warnings_count, last_warning_json, errors_count, error_summary FROM sync_runs',
      )
      .get(),
  ).toEqual({
    status: 'failed',
    warnings_count: 1,
    last_warning_json: expectedWarning,
    errors_count: 1,
    error_summary: 'boom',
  })
  expect(
    db
      .prepare(
        'SELECT last_status, warnings_count, last_warning_json, errors_count, last_error_json FROM source_sync_state',
      )
      .get(),
  ).toEqual({
    last_status: 'failed',
    warnings_count: 1,
    last_warning_json: expectedWarning,
    errors_count: 1,
    last_error_json: JSON.stringify('boom'),
  })
})

test('invalid emission is provider_bad_response and writes nothing', async () => {
  const { db, coordinator } = await setup()
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({ type: 'removeResource', ref: '' } as never)
      },
    ),
  ).rejects.toEqual(expect.objectContaining({ code: 'provider_bad_response' }))
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
  expect(db.prepare('SELECT cursor_json FROM source_sync_state').get()).toEqual(
    { cursor_json: '{ "page": 1 }' },
  )
})

test('drive failure preserves resources and cursor and releases lock', async () => {
  const { db, coordinator } = await setup()
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({ type: 'upsertResource', resource: resource() })
        throw new Error('boom')
      },
    ),
  ).rejects.toThrow('boom')
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
  expect(
    db.prepare('SELECT cursor_json, last_status FROM source_sync_state').get(),
  ).toEqual({ cursor_json: '{ "page": 1 }', last_status: 'failed' })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('normalizes a portable SDK sync failure without instanceof identity', async () => {
  const { db, coordinator } = await setup()
  const portable = syncError(
    'rate_limited',
    'GitHub rate limit reached; retry later.',
    { retryAfterMs: 30_000 },
  )
  let caught: unknown
  try {
    await coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {
        throw { ...portable }
      },
    )
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(CtxindexSyncError)
  expect(caught).toMatchObject({
    code: 'rate_limited',
    message: 'GitHub rate limit reached; retry later.',
    retryAfterMs: 30_000,
    publicMessage: true,
  })
  expect(
    db.prepare('SELECT status, error_summary FROM sync_runs').get(),
  ).toEqual({
    status: 'failed',
    error_summary: 'GitHub rate limit reached; retry later.',
  })
})

test('auth failure maps Source to needs_auth', async () => {
  const { db, coordinator } = await setup()
  const error = new CtxindexAuthError('invalid_grant', 'grant expired')
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {
        throw error
      },
    ),
  ).rejects.toBe(error)
  expect(db.prepare('SELECT last_status FROM source_sync_state').get()).toEqual(
    { last_status: 'needs_auth' },
  )
})

test('cancellation preserves cursor and persists cancelled taxonomy', async () => {
  const { db, coordinator } = await setup()
  const controller = new AbortController()
  const rejected = expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: controller.signal },
      async ({ emit }) => {
        controller.abort()
        await emit({ type: 'checkpoint', cursor: { page: 2 } })
      },
    ),
  ).rejects.toEqual(expect.objectContaining({ code: 'cancelled' }))
  await rejected
  expect(db.prepare('SELECT status FROM sync_runs').get()).toEqual({
    status: 'cancelled',
  })
  expect(db.prepare('SELECT cursor_json FROM source_sync_state').get()).toEqual(
    { cursor_json: '{ "page": 1 }' },
  )
})

test('diff validates and counts operations without durable writes', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "UPDATE source_sync_state SET last_status = 'needs_auth', last_run_id = 'prior-run', updated_at = 77 WHERE source_id = ?",
  ).run(sourceId)
  const stateBefore = JSON.stringify(
    db
      .prepare('SELECT * FROM source_sync_state WHERE source_id = ?')
      .get(sourceId),
  )
  expect(stateBefore).toContain('needs_auth')
  const result = await coordinator.run(
    { sourceId, mode: 'diff', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'warning', code: 'diff_warning', message: 'preview' })
      await emit({ type: 'checkpoint', cursor: { page: 9 } })
      await emit({ type: 'upsertResource', resource: resource() })
      await emit({ type: 'removeResource', ref })
    },
  )
  expect(result).toEqual(
    expect.objectContaining({ mode: 'diff', added: 1, updated: 0, deleted: 1 }),
  )
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
  expect(
    db.prepare('SELECT count(*) AS count FROM sync_run_checkpoints').get(),
  ).toEqual({ count: 0 })
  expect(db.prepare('SELECT cursor_after_json FROM sync_runs').get()).toEqual({
    cursor_after_json: null,
  })
  expect(
    db.prepare('SELECT warnings_count, last_warning_json FROM sync_runs').get(),
  ).toEqual({
    warnings_count: 1,
    last_warning_json: JSON.stringify({
      code: 'diff_warning',
      message: 'preview',
    }),
  })
  expect(
    JSON.stringify(
      db
        .prepare('SELECT * FROM source_sync_state WHERE source_id = ?')
        .get(sourceId),
    ),
  ).toBe(stateBefore)
})

test('failing diff audits the run without changing current Source state', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "UPDATE source_sync_state SET last_status = 'needs_auth', last_run_id = 'prior-run', updated_at = 77 WHERE source_id = ?",
  ).run(sourceId)
  const stateBefore = JSON.stringify(
    db
      .prepare('SELECT * FROM source_sync_state WHERE source_id = ?')
      .get(sourceId),
  )

  await expect(
    coordinator.run(
      { sourceId, mode: 'diff', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({
          type: 'warning',
          code: 'diff_warning',
          message: 'preview',
        })
        throw new Error('diff failed')
      },
    ),
  ).rejects.toThrow('diff failed')

  expect(
    JSON.stringify(
      db
        .prepare('SELECT * FROM source_sync_state WHERE source_id = ?')
        .get(sourceId),
    ),
  ).toBe(stateBefore)
  expect(
    db
      .prepare(
        'SELECT status, warnings_count, last_warning_json, errors_count, error_summary FROM sync_runs',
      )
      .get(),
  ).toEqual({
    status: 'failed',
    warnings_count: 1,
    last_warning_json: JSON.stringify({
      code: 'diff_warning',
      message: 'preview',
    }),
    errors_count: 1,
    error_summary: 'diff failed',
  })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('diff does not count removal of a nonexistent Resource', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.run(
    { sourceId, mode: 'diff', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'removeResource', ref })
    },
  )

  expect(result).toEqual(
    expect.objectContaining({ added: 0, updated: 0, deleted: 0 }),
  )
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
})

test('diff counts duplicate upserts in order and rolls them back', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.run(
    { sourceId, mode: 'diff', signal: new AbortController().signal },
    async ({ emit }) => {
      await emit({ type: 'upsertResource', resource: resource() })
      await emit({
        type: 'upsertResource',
        resource: {
          ...resource(),
          payload: { title: 'Updated', body: 'second' },
        },
      })
    },
  )

  expect(result).toEqual(
    expect.objectContaining({ added: 1, updated: 1, deleted: 0 }),
  )
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
})

test('cross-Source Ref is rejected before mutation', async () => {
  const { db, coordinator } = await setup()
  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({
          type: 'upsertResource',
          resource: resource(`ctx://${otherSourceId}/records/one`),
        })
        await emit({ type: 'upsertResource', resource: resource() })
      },
    ),
  ).rejects.toThrow('does not match Sync Source')
  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
})

test('unknown Source is a typed failure', async () => {
  const { coordinator } = await setup()
  await expect(
    coordinator.run(
      {
        sourceId: otherSourceId,
        mode: 'sync',
        signal: new AbortController().signal,
      },
      async () => {},
    ),
  ).rejects.toEqual(expect.objectContaining({ code: 'unknown' }))
})

test('stale global locks are recovered', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAX', ?, 'personal', 'sync', 'failed', 1)",
  ).run(sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 1)",
  ).run()
  await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async () => {},
  )
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('recovers a running global lock whose owner PID is provably dead', async () => {
  const { db } = await setup()
  const interruptedRunId = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, 'personal', 'sync', 'running', 1)",
  ).run(interruptedRunId, sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, owner_pid, acquired_at) VALUES ('global', ?, 4242, 1)",
  ).run(interruptedRunId)
  const coordinator = new SyncCoordinator(
    db,
    createProfileRegistry([profile]),
    {
      isProcessAlive: () => false,
    },
  )

  await coordinator.run(
    { sourceId, mode: 'sync', signal: new AbortController().signal },
    async () => {},
  )

  expect(
    db
      .prepare(
        'SELECT status, completed_at, error_summary FROM sync_runs WHERE id = ?',
      )
      .get(interruptedRunId),
  ).toEqual({
    status: 'failed',
    completed_at: expect.any(Number),
    error_summary: 'sync interrupted',
  })
})

test('keeps a running global lock whose owner PID is alive', async () => {
  const { db } = await setup()
  const liveRunId = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, 'personal', 'sync', 'running', 1)",
  ).run(liveRunId, sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, owner_pid, acquired_at) VALUES ('global', ?, 4242, 1)",
  ).run(liveRunId)
  const coordinator = new SyncCoordinator(
    db,
    createProfileRegistry([profile]),
    {
      isProcessAlive: () => true,
    },
  )

  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {},
    ),
  ).rejects.toEqual(
    expect.objectContaining({ code: 'unknown', message: 'sync busy' }),
  )
  expect(
    db
      .prepare(
        "SELECT run_id, owner_pid FROM sync_locks WHERE scope = 'global'",
      )
      .get(),
  ).toEqual({ run_id: liveRunId, owner_pid: 4242 })
  expect(
    db.prepare('SELECT status FROM sync_runs WHERE id = ?').get(liveRunId),
  ).toEqual({
    status: 'running',
  })
})

test('malformed durable cursor is audited after lock acquisition', async () => {
  const { db, coordinator } = await setup()
  const malformed = '{not-json'
  db.prepare(
    'UPDATE source_sync_state SET cursor_json = ? WHERE source_id = ?',
  ).run(malformed, sourceId)

  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {},
    ),
  ).rejects.toBeInstanceOf(SyntaxError)

  expect(
    db
      .prepare(
        'SELECT status, cursor_before_json, cursor_after_json FROM sync_runs',
      )
      .get(),
  ).toEqual({
    status: 'failed',
    cursor_before_json: malformed,
    cursor_after_json: null,
  })
  expect(
    db.prepare('SELECT cursor_json, last_status FROM source_sync_state').get(),
  ).toEqual({ cursor_json: malformed, last_status: 'failed' })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('invalid emitted Ref grammar is provider_bad_response without mutation', async () => {
  const { db, coordinator } = await setup()

  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({ type: 'upsertResource', resource: resource('not-a-ref') })
      },
    ),
  ).rejects.toEqual(expect.objectContaining({ code: 'provider_bad_response' }))

  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
  expect(db.prepare('SELECT cursor_json FROM source_sync_state').get()).toEqual(
    {
      cursor_json: '{ "page": 1 }',
    },
  )
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('does not reclaim a running global lock without an owner PID', async () => {
  const { db, coordinator } = await setup()
  const ownerlessRunId = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, 'personal', 'sync', 'running', 1)",
  ).run(ownerlessRunId, sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, owner_pid, acquired_at) VALUES ('global', ?, NULL, 1)",
  ).run(ownerlessRunId)

  await expect(
    coordinator.run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async () => {},
    ),
  ).rejects.toEqual(expect.objectContaining({ message: 'sync busy' }))
  expect(
    db.prepare("SELECT run_id FROM sync_locks WHERE scope = 'global'").get(),
  ).toEqual({
    run_id: ownerlessRunId,
  })
})
