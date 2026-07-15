import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createProfileRegistry } from '../registry/profile-registry'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { SyncCoordinator } from './sync-coordinator'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ref = `ctx://${sourceId}/records/one`
const dbs: Database[] = []
const tempDirs: string[] = []
const profile = defineProfile({
  id: 'fake.record',
  version: 1,
  schema: z.object({ title: z.string(), body: z.string() }),
  search: {
    title: (payload) => payload.title,
    chunks: (payload) => [payload.body],
  },
})

test('sync rejects a Resource belonging to another Source', async () => {
  const { db, coordinator } = await setup()
  const otherSourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(otherSourceId, 'personal', 'fake', 1, '{}', 1, 1)

  await expect(
    coordinator.execute({
      sourceId,
      mode: 'sync',
      cursorAfter: null,
      operations: [
        {
          type: 'upsertResource',
          resource: {
            ref: `ctx://${otherSourceId}/records/one`,
            sourceId: otherSourceId,
            profile: { id: 'fake.record', version: 1 },
            origin: 'synced',
            completeness: 'complete',
            payload: { title: 'Wrong source', body: 'content' },
          },
        },
      ],
    }),
  ).rejects.toThrow('does not match Sync Source')
})

test('sync upgrades an adhoc Resource to synced regardless of operation origin', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "INSERT INTO resources (id, ref, source_id, realm_id, profile_id, profile_version, origin, created_at, updated_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAW', ?, ?, 'personal', 'fake.record', 1, 'adhoc', 1, 1)",
  ).run(ref, sourceId)

  await coordinator.execute({
    sourceId,
    mode: 'sync',
    cursorAfter: null,
    operations: [
      {
        type: 'upsertResource',
        resource: {
          ref,
          sourceId,
          profile: { id: 'fake.record', version: 1 },
          origin: 'adhoc',
          completeness: 'complete',
          payload: { title: 'Synced', body: 'content' },
        },
      },
    ],
  })

  expect(
    db.prepare('SELECT origin FROM resources WHERE ref = ?').get(ref),
  ).toEqual({
    origin: 'synced',
  })
})

async function setup() {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sourceId, 'personal', 'fake', 1, '{}', 1, 1)
  db.prepare(
    "INSERT INTO source_sync_state (source_id, last_status, cursor_json, updated_at) VALUES (?, 'idle', ?, ?)",
  ).run(sourceId, JSON.stringify({ page: 1 }), 1)
  dbs.push(db)
  return {
    db,
    coordinator: new SyncCoordinator(db, createProfileRegistry([profile])),
  }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

test('successful sync commits Resource writes, run, and cursor together', async () => {
  const { db, coordinator } = await setup()
  const result = await coordinator.execute({
    sourceId,
    mode: 'sync',
    cursorAfter: { page: 2 },
    operations: [
      { type: 'checkpoint', cursor: { page: 1.5 } },
      {
        type: 'upsertResource',
        resource: {
          ref,
          sourceId,
          profile: { id: 'fake.record', version: 1 },
          origin: 'synced',
          completeness: 'complete',
          payload: { title: 'Stored', body: 'content' },
        },
      },
    ],
  })

  expect(
    db.prepare('SELECT title FROM resources WHERE ref = ?').get(ref),
  ).toEqual({ title: 'Stored' })
  expect(
    db
      .prepare(
        'SELECT cursor_json, last_status, last_run_id FROM source_sync_state',
      )
      .get(),
  ).toEqual({
    cursor_json: JSON.stringify({ page: 2 }),
    last_status: 'idle',
    last_run_id: result.runId,
  })
  expect(
    db.prepare('SELECT cursor_json FROM sync_run_checkpoints').get(),
  ).toEqual({
    cursor_json: JSON.stringify({ page: 1.5 }),
  })
  expect(
    db
      .prepare(
        'SELECT status, cursor_before_json, cursor_after_json, resources_added FROM sync_runs',
      )
      .get(),
  ).toEqual({
    status: 'completed',
    cursor_before_json: JSON.stringify({ page: 1 }),
    cursor_after_json: JSON.stringify({ page: 2 }),
    resources_added: 1,
  })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('failed apply rolls back Resources and advances neither cursor nor success state', async () => {
  const { db, coordinator } = await setup()

  await expect(
    coordinator.execute({
      sourceId,
      mode: 'sync',
      cursorAfter: { page: 2 },
      operations: [
        {
          type: 'upsertResource',
          resource: {
            ref,
            sourceId,
            profile: { id: 'fake.record', version: 1 },
            origin: 'synced',
            completeness: 'complete',
            payload: { title: 'Partial', body: 'content' },
          },
        },
        {
          type: 'upsertResource',
          resource: {
            ref: `ctx://${sourceId}/records/two`,
            sourceId,
            profile: { id: 'fake.record', version: 1 },
            origin: 'synced',
            completeness: 'complete',
            payload: { title: 123, body: 'invalid' },
          },
        },
      ],
    }),
  ).rejects.toThrow()

  expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual({
    count: 0,
  })
  expect(
    db.prepare('SELECT cursor_json, last_status FROM source_sync_state').get(),
  ).toEqual({
    cursor_json: JSON.stringify({ page: 1 }),
    last_status: 'failed',
  })
  expect(
    db.prepare('SELECT status, cursor_after_json FROM sync_runs').get(),
  ).toEqual({ status: 'failed', cursor_after_json: null })
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('global lock contention persists a cancelled busy run', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAX', ?, 'personal', 'sync', 'running', 1)",
  ).run(sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 1)",
  ).run()

  await expect(
    coordinator.execute({
      sourceId,
      mode: 'sync',
      cursorAfter: null,
      operations: [],
    }),
  ).rejects.toEqual(
    expect.objectContaining({ code: 'unknown', message: 'sync busy' }),
  )
  expect(
    db.prepare("SELECT run_id FROM sync_locks WHERE scope = 'global'").get(),
  ).toEqual({ run_id: '01ARZ3NDEKTSV4RRFFQ69G5FAX' })
  expect(
    db
      .prepare(
        "SELECT status, error_summary FROM sync_runs WHERE id != '01ARZ3NDEKTSV4RRFFQ69G5FAX'",
      )
      .get(),
  ).toEqual({ status: 'cancelled', error_summary: 'sync busy' })
})

test('the Source lock commits before Resource and cursor writes begin', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctxindex-sync-lock-'))
  tempDirs.push(dir)
  const path = join(dir, 'db.sqlite')
  const writer = new Database(path, { create: true })
  applyPragmas(writer)
  await runMigrations(writer)
  writer.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  writer
    .prepare(
      'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(sourceId, 'personal', 'fake', 1, '{}', 1, 1)
  const observer = new Database(path)
  applyPragmas(observer)
  dbs.push(observer, writer)
  let observedLock: unknown = null
  const observingProfile = defineProfile({
    id: 'fake.record',
    version: 1,
    schema: z.object({ title: z.string(), body: z.string() }),
    search: {
      title: (payload) => {
        observedLock = observer.prepare('SELECT scope FROM sync_locks').get()
        return payload.title
      },
      chunks: (payload) => [payload.body],
    },
  })

  await new SyncCoordinator(
    writer,
    createProfileRegistry([observingProfile]),
  ).execute({
    sourceId,
    mode: 'sync',
    cursorAfter: { page: 1 },
    operations: [
      {
        type: 'upsertResource',
        resource: {
          ref,
          sourceId,
          profile: { id: 'fake.record', version: 1 },
          origin: 'synced',
          completeness: 'complete',
          payload: { title: 'Stored', body: 'content' },
        },
      },
    ],
  })

  expect(observedLock).toEqual({ scope: 'global' })
})

test('a lock owned by a non-running run is recovered before execution', async () => {
  const { db, coordinator } = await setup()
  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at, completed_at) VALUES ('01ARZ3NDEKTSV4RRFFQ69G5FAX', ?, 'personal', 'sync', 'failed', 1, 2)",
  ).run(sourceId)
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 1)",
  ).run()

  const result = await coordinator.execute({
    sourceId,
    mode: 'sync',
    cursorAfter: { page: 2 },
    operations: [],
  })

  expect(result.runId).not.toBe('01ARZ3NDEKTSV4RRFFQ69G5FAX')
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})
