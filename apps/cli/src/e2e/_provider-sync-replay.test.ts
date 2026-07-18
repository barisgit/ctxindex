import { Database } from 'bun:sqlite'
import { expect } from 'bun:test'
import { join } from 'node:path'
import type { Sandbox } from '@ctxindex/core/testing'

export type ReplayPhase =
  | 'initial'
  | 'unchanged'
  | 'mutation'
  | 'repeatedMutation'
  | 'recovery'
  | 'postRecovery'

interface ReplayEventIds {
  readonly unchanged: string
  readonly updated: string
  readonly removed: string
  readonly added: string
}

export interface ProviderSyncReplayDriver<TRequest> {
  readonly provider: 'google' | 'microsoft'
  readonly adapterId: 'google.calendar' | 'microsoft.calendar'
  readonly accountLabel: string
  readonly sourceLabel: string
  readonly sourceConfigArgs: readonly string[]
  readonly env: Record<string, string | undefined>
  readonly eventIds: ReplayEventIds
  readonly updatedTitle: string
  readonly invalidationWarning: string
  readonly resetRequests: () => void
  readonly readRequests: () => readonly TRequest[]
  readonly inspectRequests: (
    phase: ReplayPhase,
    requests: readonly TRequest[],
  ) => void
  readonly applyMutation: () => void
  readonly advanceCursorGeneration: () => void
  readonly expireCursor: () => void
}

interface SyncRunOutput {
  readonly runId: string
  readonly status: string
  readonly added: number
  readonly updated: number
  readonly deleted: number
  readonly errorsCount: number
  readonly warnings: readonly { readonly code: string }[]
}

interface PersistedSyncRun {
  readonly id: string
  readonly cursor_before_json: string | null
  readonly cursor_after_json: string | null
  readonly resources_added: number
  readonly resources_updated: number
  readonly resources_deleted: number
}

interface MaterializedResource {
  readonly ref: string
  readonly title: string | null
  readonly payload_json: string | null
  readonly deleted_at: number | null
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function parseSyncRun(stdout: string): SyncRunOutput {
  const parsed = JSON.parse(stdout) as {
    readonly results?: readonly { readonly run?: unknown }[]
  }
  const run = parsed.results?.[0]?.run
  if (!run || typeof run !== 'object') {
    throw new Error(`Could not parse sync result from: ${stdout}`)
  }
  return run as SyncRunOutput
}

function calendarRef(sourceId: string, providerEventId: string): string {
  return `ctx://${sourceId}/event/${encodeURIComponent(providerEventId)}`
}

export async function runProviderSyncReplay<TRequest>(
  sandbox: Sandbox,
  driver: ProviderSyncReplayDriver<TRequest>,
): Promise<void> {
  for (const args of [
    ['init'],
    ['realm', 'add', 'replay'],
    ['client', 'add', driver.provider, '--from-env'],
    ['account', 'add', driver.provider, '--label', driver.accountLabel],
  ]) {
    const result = await sandbox.run(args, { env: driver.env })
    expect(result.exitCode, result.stderr).toBe(0)
  }
  const source = await sandbox.run(
    [
      'source',
      'add',
      driver.adapterId,
      '--realm',
      'replay',
      '--account',
      driver.accountLabel,
      '--label',
      driver.sourceLabel,
      ...driver.sourceConfigArgs,
    ],
    { env: driver.env },
  )
  expect(source.exitCode, source.stderr).toBe(0)
  const sourceId = parseSourceId(source.stdout)
  const databasePath = join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')

  const readDatabase = <T>(read: (database: Database) => T): T => {
    const database = new Database(databasePath, { readonly: true })
    try {
      return read(database)
    } finally {
      database.close()
    }
  }
  const readCursor = () =>
    readDatabase(
      (database) =>
        (
          database
            .query(
              'SELECT cursor_json FROM source_sync_state WHERE source_id = ?',
            )
            .get(sourceId) as { readonly cursor_json: string | null }
        ).cursor_json,
    )
  const readResources = () =>
    readDatabase((database) =>
      database
        .query(
          `SELECT ref, title, payload_json, deleted_at
             FROM resources
            WHERE source_id = ?
            ORDER BY ref`,
        )
        .all(sourceId),
    ) as MaterializedResource[]
  const readRuns = () =>
    readDatabase((database) =>
      database
        .query(
          `SELECT id, cursor_before_json, cursor_after_json,
                  resources_added, resources_updated, resources_deleted
             FROM sync_runs
            WHERE source_id = ?
            ORDER BY started_at, id`,
        )
        .all(sourceId),
    ) as PersistedSyncRun[]

  const runPhase = async (
    phase: ReplayPhase,
    counts?: {
      readonly added: number
      readonly updated: number
      readonly deleted: number
    },
  ): Promise<SyncRunOutput> => {
    driver.resetRequests()
    const result = await sandbox.run(
      ['sync', '--source', driver.sourceLabel, '--json'],
      { env: driver.env },
    )
    expect(result.exitCode, `${phase}: ${result.stderr}`).toBe(0)
    const run = parseSyncRun(result.stdout)
    expect(run).toMatchObject({ status: 'completed', ...(counts ?? {}) })
    driver.inspectRequests(phase, driver.readRequests())
    return run
  }

  const initial = await runPhase('initial', {
    added: 3,
    updated: 0,
    deleted: 0,
  })
  expect(initial.errorsCount).toBe(0)
  const initialCursor = readCursor()
  expect(initialCursor).not.toBeNull()
  const initialSnapshot = readResources()
  expect(initialSnapshot).toHaveLength(3)
  expect(initialSnapshot.every(({ deleted_at }) => deleted_at === null)).toBe(
    true,
  )

  const unchanged = await runPhase('unchanged', {
    added: 0,
    updated: 0,
    deleted: 0,
  })
  expect(unchanged.errorsCount).toBe(0)
  const unchangedCursor = readCursor()
  expect(unchangedCursor).not.toBeNull()
  expect(readResources()).toEqual(initialSnapshot)

  driver.applyMutation()
  const mutation = await runPhase('mutation', {
    added: 1,
    updated: 1,
    deleted: 1,
  })
  expect(mutation.errorsCount).toBe(0)
  const mutationCursor = readCursor()
  expect(mutationCursor).not.toBe(unchangedCursor)
  const mutationSnapshot = readResources()
  expect(mutationSnapshot).toHaveLength(4)
  expect(
    mutationSnapshot.filter(({ deleted_at }) => deleted_at !== null),
  ).toEqual([
    expect.objectContaining({
      ref: calendarRef(sourceId, driver.eventIds.removed),
    }),
  ])
  expect(
    mutationSnapshot.find(
      ({ ref }) => ref === calendarRef(sourceId, driver.eventIds.updated),
    ),
  ).toMatchObject({
    ref: calendarRef(sourceId, driver.eventIds.updated),
    title: driver.updatedTitle,
    deleted_at: null,
  })
  expect(
    mutationSnapshot.find(
      ({ ref }) => ref === calendarRef(sourceId, driver.eventIds.unchanged),
    ),
  ).toMatchObject({ deleted_at: null })
  expect(
    mutationSnapshot.find(
      ({ ref }) => ref === calendarRef(sourceId, driver.eventIds.added),
    ),
  ).toMatchObject({ deleted_at: null })

  const repeatedMutation = await runPhase('repeatedMutation', {
    added: 0,
    updated: 0,
    deleted: 0,
  })
  expect(repeatedMutation.errorsCount).toBe(0)
  const repeatedCursor = readCursor()
  expect(repeatedCursor).not.toBeNull()
  expect(readResources()).toEqual(mutationSnapshot)

  driver.advanceCursorGeneration()
  driver.expireCursor()
  const recovery = await runPhase('recovery', {
    added: 0,
    updated: 3,
    deleted: 0,
  })
  expect(recovery.warnings.map(({ code }) => code)).toEqual([
    driver.invalidationWarning,
  ])
  const recoveryCursor = readCursor()
  expect(recoveryCursor).not.toBeNull()
  expect(recoveryCursor).not.toBe(repeatedCursor)
  expect(readResources()).toEqual(mutationSnapshot)
  expect(
    readDatabase((database) =>
      database
        .query('SELECT cursor_json FROM sync_run_checkpoints WHERE run_id = ?')
        .all(recovery.runId),
    ),
  ).toEqual([{ cursor_json: recoveryCursor }])

  const postRecovery = await runPhase('postRecovery', {
    added: 0,
    updated: 0,
    deleted: 0,
  })
  expect(postRecovery.errorsCount).toBe(0)
  const postRecoveryCursor = readCursor()
  expect(postRecoveryCursor).not.toBeNull()
  expect(readResources()).toEqual(mutationSnapshot)

  const runs = readRuns()
  expect(runs).toHaveLength(6)
  expect(runs.map(({ cursor_before_json }) => cursor_before_json)).toEqual([
    null,
    initialCursor,
    unchangedCursor,
    mutationCursor,
    repeatedCursor,
    recoveryCursor,
  ])
  expect(runs.map(({ cursor_after_json }) => cursor_after_json)).toEqual([
    initialCursor,
    unchangedCursor,
    mutationCursor,
    repeatedCursor,
    recoveryCursor,
    postRecoveryCursor,
  ])
  const persistedCounts = runs.map(
    ({ resources_added, resources_updated, resources_deleted }) => [
      resources_added,
      resources_updated,
      resources_deleted,
    ],
  )
  expect(persistedCounts.slice(0, 4)).toEqual([
    [3, 0, 0],
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ])
  expect(persistedCounts[4]).toEqual([0, 3, 0])
  expect(persistedCounts[5]).toEqual([0, 0, 0])
}
