import { ulid } from 'ulid'
import type { CtxindexDatabase } from '../storage/db'
import type { ExitCode } from './exit-codes'
import { EXIT_CODES, mapSyncErrorCode } from './exit-codes'

export interface SyncRunResult {
  exitCode: ExitCode
  runId: string
  status: string
  itemsAdded: number
  itemsUpdated: number
  itemsDeleted: number
  errorsCount: number
}

interface SourceRow {
  id: string
  realm_id: string
  adapter_id: string
}

interface SyncStateRow {
  source_id: string
  last_status: string
  cursor_json: string | null
}

/**
 * Release any stale global lock whose sync_run has a non-'running' status.
 * This handles the crash-recovery case (SIGKILL left lock + non-running run).
 */
export function releaseStaleGlobalLock(db: CtxindexDatabase): boolean {
  const lock = db
    .prepare("SELECT scope, run_id FROM sync_locks WHERE scope = 'global'")
    .get() as { scope: string; run_id: string } | null

  if (!lock) return false

  const run = db
    .prepare('SELECT status FROM sync_runs WHERE id = ?')
    .get(lock.run_id) as { status: string } | null

  if (run && run.status !== 'running') {
    db.prepare("DELETE FROM sync_locks WHERE scope = 'global'").run()
    return true
  }
  return false
}

export type AdapterSyncFn = (ctx: {
  sourceId: string
  cursorJson: string | null
}) => AsyncGenerator<unknown>

export interface RunSyncOptions {
  sourceId: string
  mode?: 'sync' | 'resync' | 'diff'
  adapter: { sync: AdapterSyncFn }
}

/**
 * Core sync runner: acquires lock, runs adapter, handles errors, releases lock.
 */
export async function runSync(
  db: CtxindexDatabase,
  options: RunSyncOptions,
): Promise<SyncRunResult> {
  const { sourceId, mode = 'sync', adapter } = options

  // Fetch source
  const source = db
    .prepare('SELECT id, realm_id, adapter_id FROM sources WHERE id = ?')
    .get(sourceId) as SourceRow | null

  if (!source) {
    throw new Error(`source not found: "${sourceId}"`)
  }

  // Release stale locks
  releaseStaleGlobalLock(db)

  // Check if lock is already held by a live run
  const existingLock = db
    .prepare("SELECT run_id FROM sync_locks WHERE scope = 'global'")
    .get() as { run_id: string } | null

  if (existingLock) {
    // Sync is busy — create cancelled run record
    const cancelledRunId = ulid()
    db.prepare(
      `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at, completed_at, error_json)
       VALUES (?, ?, ?, ?, 'cancelled', ?, ?, ?)`,
    ).run(
      cancelledRunId,
      source.id,
      source.realm_id,
      mode,
      Date.now(),
      Date.now(),
      JSON.stringify({ error: 'sync busy' }),
    )

    return {
      exitCode: EXIT_CODES.OTHER_FAILURE,
      runId: cancelledRunId,
      status: 'cancelled',
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      errorsCount: 0,
    }
  }

  // Get current cursor
  const syncState = db
    .prepare(
      'SELECT source_id, last_status, cursor_json FROM source_sync_state WHERE source_id = ?',
    )
    .get(sourceId) as SyncStateRow | null

  const cursorJson = syncState?.cursor_json ?? null

  // Create sync run
  const runId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, ?, ?, 'running', ?)`,
  ).run(runId, source.id, source.realm_id, mode, Date.now())

  // Upsert source_sync_state to syncing
  db.prepare(
    `INSERT INTO source_sync_state (source_id, last_status, last_run_id, cursor_json, updated_at)
     VALUES (?, 'syncing', ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET last_status='syncing', last_run_id=excluded.last_run_id, updated_at=excluded.updated_at`,
  ).run(sourceId, runId, cursorJson, Date.now())

  // Acquire global lock
  db.prepare(
    "INSERT INTO sync_locks (scope, run_id, acquired_at) VALUES ('global', ?, ?)",
  ).run(runId, Date.now())

  let errorsCount = 0
  let itemsAdded = 0
  let itemsUpdated = 0
  let itemsDeleted = 0
  let newCursorJson: string | null = cursorJson

  try {
    // Run adapter
    for await (const op of adapter.sync({ sourceId, cursorJson })) {
      const o = op as Record<string, unknown>
      if (o.type === 'item_added') itemsAdded++
      else if (o.type === 'item_updated') itemsUpdated++
      else if (o.type === 'item_deleted') itemsDeleted++
      else if (o.type === 'error') errorsCount++
      else if (o.type === 'cursor') newCursorJson = o.cursor as string
    }

    // Success — mark completed, advance cursor
    db.prepare(
      `UPDATE sync_runs SET status='completed', completed_at=?, items_added=?, items_updated=?,
       items_deleted=?, errors_count=? WHERE id=?`,
    ).run(
      Date.now(),
      itemsAdded,
      itemsUpdated,
      itemsDeleted,
      errorsCount,
      runId,
    )

    db.prepare(
      `INSERT INTO source_sync_state (source_id, last_status, last_run_id, cursor_json, updated_at)
       VALUES (?, 'idle', ?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET
         last_status='idle', last_run_id=excluded.last_run_id,
         cursor_json=excluded.cursor_json, updated_at=excluded.updated_at`,
    ).run(sourceId, runId, newCursorJson, Date.now())

    db.prepare("DELETE FROM sync_locks WHERE scope = 'global'").run()

    return {
      exitCode: errors_count_to_exit(errorsCount),
      runId,
      status: 'completed',
      itemsAdded,
      itemsUpdated,
      itemsDeleted,
      errorsCount,
    }
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'unknown'
    const { exitCode, runStatus, lastStatus } = mapSyncErrorCode(code)

    db.prepare(
      `UPDATE sync_runs SET status=?, completed_at=?, errors_count=?, error_json=? WHERE id=?`,
    ).run(
      runStatus,
      Date.now(),
      errorsCount + 1,
      JSON.stringify({ error: String(err) }),
      runId,
    )

    db.prepare(
      `INSERT INTO source_sync_state (source_id, last_status, last_run_id, cursor_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source_id) DO UPDATE SET
         last_status=excluded.last_status, last_run_id=excluded.last_run_id, updated_at=excluded.updated_at`,
    ).run(sourceId, lastStatus, runId, cursorJson, Date.now())

    db.prepare("DELETE FROM sync_locks WHERE scope = 'global'").run()

    return {
      exitCode,
      runId,
      status: runStatus,
      itemsAdded,
      itemsUpdated,
      itemsDeleted,
      errorsCount: errorsCount + 1,
    }
  }
}

function errors_count_to_exit(_errorsCount: number): ExitCode {
  // Partial-success: completed with errors still exits 0 per SPEC §12
  return EXIT_CODES.OK
}
