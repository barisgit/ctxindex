import { CtxindexSyncError } from '../errors'
import { newId } from '../ids'
import type { ProfileRegistry } from '../registry/profile-registry'
import {
  type ResourceRemoval,
  ResourceStore,
  type ResourceUpsert,
} from '../resource/resource-store'
import type { CtxindexDatabase } from '../storage/db'

export type SyncApplyOperation =
  | { readonly type: 'upsertResource'; readonly resource: ResourceUpsert }
  | { readonly type: 'removeResource'; readonly resource: ResourceRemoval }
  | { readonly type: 'checkpoint'; readonly cursor: unknown }

export interface SyncExecution {
  readonly sourceId: string
  readonly mode: 'sync' | 'resync' | 'diff'
  readonly cursorAfter: unknown | null
  readonly operations: readonly SyncApplyOperation[]
}

export interface SyncExecutionResult {
  readonly runId: string
}

function cursorJson(cursor: unknown | null): string | null {
  return cursor === null ? null : JSON.stringify(cursor)
}

export class SyncCoordinator {
  private readonly resources: ResourceStore

  constructor(
    private readonly db: CtxindexDatabase,
    profiles: ProfileRegistry,
  ) {
    this.resources = new ResourceStore(db, profiles)
  }

  async execute(input: SyncExecution): Promise<SyncExecutionResult> {
    const source = this.db
      .prepare('SELECT realm_id FROM sources WHERE id = ?')
      .get(input.sourceId) as { realm_id: string } | null
    if (!source) {
      throw new CtxindexSyncError(
        `Unknown Source "${input.sourceId}"`,
        'unknown',
      )
    }
    const runId = newId()
    const startedAt = Date.now()
    const state = this.db
      .prepare('SELECT cursor_json FROM source_sync_state WHERE source_id = ?')
      .get(input.sourceId) as { cursor_json: string | null } | null
    const cursorBefore = state?.cursor_json ?? null

    const acquired = this.db.transaction(() => {
      this.db
        .prepare(`
        DELETE FROM sync_locks
        WHERE scope = 'global'
          AND NOT EXISTS (
            SELECT 1 FROM sync_runs
            WHERE sync_runs.id = sync_locks.run_id
              AND sync_runs.status = 'running'
          )
      `)
        .run()
      this.db
        .prepare(`
        INSERT INTO sync_runs (
          id, source_id, realm_id, mode, status, started_at, cursor_before_json
        ) VALUES (?, ?, ?, ?, 'running', ?, ?)
      `)
        .run(
          runId,
          input.sourceId,
          source.realm_id,
          input.mode,
          startedAt,
          cursorBefore,
        )
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sync_locks (scope, run_id, owner_pid, acquired_at) VALUES ('global', ?, ?, ?)",
        )
        .run(runId, process.pid, startedAt)
      const ownsLock = this.db
        .prepare(
          "SELECT 1 FROM sync_locks WHERE scope = 'global' AND run_id = ?",
        )
        .get(runId)
      if (!ownsLock) {
        this.db
          .prepare(`
            UPDATE sync_runs
            SET status = 'cancelled', completed_at = ?, error_summary = 'sync busy'
            WHERE id = ?
          `)
          .run(Date.now(), runId)
      }
      return Boolean(ownsLock)
    })()
    if (!acquired) throw new CtxindexSyncError('sync busy', 'unknown')

    try {
      this.db.transaction(() => {
        let added = 0
        let updated = 0
        let deleted = 0
        for (const operation of input.operations) {
          if (operation.type === 'upsertResource') {
            if (operation.resource.sourceId !== input.sourceId) {
              throw new CtxindexSyncError(
                `Resource Source "${operation.resource.sourceId}" does not match Sync Source "${input.sourceId}"`,
                'unknown',
              )
            }
            const existing = this.resources.get(operation.resource.ref, {
              includeDeleted: true,
            })
            this.resources.upsert({ ...operation.resource, origin: 'synced' })
            if (existing) updated += 1
            else added += 1
          } else if (operation.type === 'removeResource') {
            if (operation.resource.sourceId !== input.sourceId) {
              throw new CtxindexSyncError(
                `Resource Source "${operation.resource.sourceId}" does not match Sync Source "${input.sourceId}"`,
                'unknown',
              )
            }
            const existing = this.resources.get(operation.resource.ref, {
              includeDeleted: true,
            })
            this.resources.remove(operation.resource)
            if (existing) deleted += 1
          } else {
            this.db
              .prepare(
                'INSERT INTO sync_run_checkpoints (id, run_id, cursor_json, recorded_at) VALUES (?, ?, ?, ?)',
              )
              .run(newId(), runId, JSON.stringify(operation.cursor), Date.now())
          }
        }

        const completedAt = Date.now()
        const after = cursorJson(input.cursorAfter)
        this.db
          .prepare(`
          INSERT INTO source_sync_state (
            source_id, last_status, last_run_id, cursor_json, updated_at
          ) VALUES (?, 'idle', ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            last_status = 'idle',
            last_run_id = excluded.last_run_id,
            cursor_json = excluded.cursor_json,
            updated_at = excluded.updated_at
        `)
          .run(input.sourceId, runId, after, completedAt)
        this.db
          .prepare(`
          UPDATE sync_runs
          SET status = 'completed', completed_at = ?, cursor_after_json = ?,
              resources_added = ?, resources_updated = ?, resources_deleted = ?
          WHERE id = ?
        `)
          .run(completedAt, after, added, updated, deleted, runId)
        this.db
          .prepare(
            "DELETE FROM sync_locks WHERE scope = 'global' AND run_id = ?",
          )
          .run(runId)
      })()
      return { runId }
    } catch (cause) {
      const completedAt = Date.now()
      this.db.transaction(() => {
        this.db
          .prepare(`
          UPDATE sync_runs
          SET status = 'failed', completed_at = ?, error_summary = ?
          WHERE id = ?
        `)
          .run(
            completedAt,
            cause instanceof Error ? cause.message : String(cause),
            runId,
          )
        this.db
          .prepare(`
          INSERT INTO source_sync_state (
            source_id, last_status, last_run_id, cursor_json, updated_at
          ) VALUES (?, 'failed', ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            last_status = 'failed',
            last_run_id = excluded.last_run_id,
            updated_at = excluded.updated_at
        `)
          .run(input.sourceId, runId, cursorBefore, completedAt)
        this.db
          .prepare(
            "DELETE FROM sync_locks WHERE scope = 'global' AND run_id = ?",
          )
          .run(runId)
      })()
      throw cause
    }
  }
}
