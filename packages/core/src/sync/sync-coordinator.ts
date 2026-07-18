import type { SyncEmission, SyncMode } from '@ctxindex/extension-sdk'
import { CtxindexAuthError, CtxindexSyncError } from '../errors'
import { mapSyncErrorCode } from '../exit-codes'
import { newId } from '../ids'
import { parseRef } from '../ref/ref'
import type { ProfileRegistry } from '../registry/profile-registry'
import { ResourceStore } from '../resource/resource-store'
import type { CtxindexDatabase } from '../storage/db'
import { parseSyncEmission } from './emission'

export interface SyncRunInput {
  readonly sourceId: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
}

type BufferedEmission = Exclude<SyncEmission, { readonly type: 'warning' }>

export interface SyncDriveContext {
  readonly cursor: unknown | null
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly emit: (emission: SyncEmission) => void | Promise<void>
}

export type SyncDrive = (context: SyncDriveContext) => void | Promise<void>

export interface SyncWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface SyncRunResult {
  readonly runId: string
  readonly mode: SyncMode
  readonly status: 'completed'
  readonly added: number
  readonly updated: number
  readonly deleted: number
  readonly warningsCount: number
  readonly lastWarning: SyncWarning | null
  readonly errorsCount: number
  readonly warnings: readonly SyncWarning[]
}

export interface SyncRunFailureDiagnostics {
  readonly warningsCount: number
  readonly lastWarning: SyncWarning | null
  readonly errorsCount: 1
  readonly lastError: string
}

const failureDiagnostics = new WeakMap<object, SyncRunFailureDiagnostics>()

export function getSyncRunFailureDiagnostics(
  error: unknown,
): SyncRunFailureDiagnostics | null {
  return typeof error === 'object' && error !== null
    ? (failureDiagnostics.get(error) ?? null)
    : null
}

const SUMMARY_LIMIT = 2048
const DIFF_ROLLBACK = Symbol('diff rollback')

function bounded(value: string): string {
  return value.slice(0, SUMMARY_LIMIT)
}

function cancelled(): CtxindexSyncError {
  return new CtxindexSyncError('Sync cancelled', 'cancelled')
}

function parseEmissionRef(ref: string): ReturnType<typeof parseRef> {
  try {
    return parseRef(ref)
  } catch (cause) {
    throw new CtxindexSyncError(
      `Invalid Sync emission Ref "${ref}"`,
      'provider_bad_response',
      { cause },
    )
  }
}

function warningJson(warning: SyncWarning | null): string | null {
  return warning === null ? null : JSON.stringify(warning)
}

export interface SyncCoordinatorOptions {
  readonly isProcessAlive?: (pid: number) => boolean
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return !(
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'ESRCH'
    )
  }
}

export class SyncCoordinator {
  private readonly resources: ResourceStore
  private readonly processIsAlive: (pid: number) => boolean

  constructor(
    private readonly db: CtxindexDatabase,
    profiles: ProfileRegistry,
    options: SyncCoordinatorOptions = {},
  ) {
    this.resources = new ResourceStore(db, profiles)
    this.processIsAlive = options.isProcessAlive ?? isProcessAlive
  }

  async run(input: SyncRunInput, drive: SyncDrive): Promise<SyncRunResult> {
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
    const cursorBeforeJson = state?.cursor_json ?? null

    const acquired = this.db.transaction(() => {
      const globalLock = this.db
        .prepare(`
          SELECT sync_locks.run_id, sync_locks.owner_pid, sync_runs.status
          FROM sync_locks
          JOIN sync_runs ON sync_runs.id = sync_locks.run_id
          WHERE sync_locks.scope = 'global'
        `)
        .get() as {
        run_id: string
        owner_pid: number | null
        status: string
      } | null
      if (
        globalLock?.status === 'running' &&
        globalLock.owner_pid !== null &&
        !this.processIsAlive(globalLock.owner_pid)
      ) {
        this.db
          .prepare(`
            UPDATE sync_runs
            SET status = 'failed', completed_at = ?, errors_count = 1,
                error_summary = ?
            WHERE id = ? AND status = 'running'
          `)
          .run(Date.now(), bounded('sync interrupted'), globalLock.run_id)
      }
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
          cursorBeforeJson,
        )
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sync_locks (scope, run_id, owner_pid, acquired_at) VALUES ('global', ?, ?, ?)",
        )
        .run(runId, process.pid, startedAt)
      const owns = Boolean(
        this.db
          .prepare(
            "SELECT 1 FROM sync_locks WHERE scope = 'global' AND run_id = ?",
          )
          .get(runId),
      )
      if (!owns) {
        this.db
          .prepare(`
          UPDATE sync_runs
          SET status = 'cancelled', completed_at = ?, errors_count = 1,
              error_summary = 'sync busy'
          WHERE id = ?
        `)
          .run(Date.now(), runId)
      }
      return owns
    })()
    if (!acquired) throw new CtxindexSyncError('sync busy', 'unknown')

    const emissions: BufferedEmission[] = []
    const warnings: SyncWarning[] = []
    let cursorAfterJson = cursorBeforeJson

    try {
      const cursor =
        cursorBeforeJson === null ? null : JSON.parse(cursorBeforeJson)
      if (input.signal.aborted) throw cancelled()
      await drive({
        cursor,
        mode: input.mode,
        signal: input.signal,
        emit: async (value) => {
          if (input.signal.aborted) throw cancelled()
          const emission = parseSyncEmission(value)
          if (emission.type === 'warning') {
            warnings.push({
              code: emission.code,
              message: emission.message,
              ...(emission.ref ? { ref: emission.ref } : {}),
            })
          } else emissions.push(emission)
          if (emission.type === 'checkpoint') {
            cursorAfterJson = JSON.stringify(emission.cursor)
          }
        },
      })
      if (input.signal.aborted) throw cancelled()

      for (const emission of emissions) {
        if (emission.type === 'checkpoint') continue
        const resourceRef =
          emission.type === 'upsertResource'
            ? emission.resource.ref
            : emission.ref
        const parsed = parseEmissionRef(resourceRef)
        if (parsed.sourceId !== input.sourceId) {
          throw new CtxindexSyncError(
            `Ref Source "${parsed.sourceId}" does not match Sync Source "${input.sourceId}"`,
            'provider_bad_response',
          )
        }
      }

      let added = 0
      let updated = 0
      let deleted = 0
      const applyResource = (emission: BufferedEmission): void => {
        if (emission.type === 'checkpoint') return
        const resourceRef =
          emission.type === 'upsertResource'
            ? emission.resource.ref
            : emission.ref
        const existing = this.resources.get(resourceRef, {
          includeDeleted: true,
        })
        if (emission.type === 'upsertResource') {
          this.resources.upsert({
            ...emission.resource,
            sourceId: input.sourceId,
            origin: 'synced',
          })
          if (existing) updated += 1
          else added += 1
        } else {
          this.resources.remove({
            ref: emission.ref,
            sourceId: input.sourceId,
            deletedAt: Date.now(),
          })
          if (existing) deleted += 1
        }
      }

      if (input.mode === 'diff') {
        try {
          this.db.transaction(() => {
            for (const emission of emissions) applyResource(emission)
            throw DIFF_ROLLBACK
          })()
        } catch (cause) {
          if (cause !== DIFF_ROLLBACK) throw cause
        }
      }

      this.db.transaction(() => {
        if (input.mode !== 'diff') {
          for (const emission of emissions) {
            if (emission.type === 'checkpoint') {
              this.db
                .prepare(
                  'INSERT INTO sync_run_checkpoints (id, run_id, cursor_json, recorded_at) VALUES (?, ?, ?, ?)',
                )
                .run(
                  newId(),
                  runId,
                  JSON.stringify(emission.cursor),
                  Date.now(),
                )
            } else {
              applyResource(emission)
            }
          }
        }

        const completedAt = Date.now()
        if (input.mode !== 'diff') {
          this.db
            .prepare(`
          INSERT INTO source_sync_state (
            source_id, last_status, last_run_id, cursor_json, warnings_count,
            last_warning_json, updated_at
          ) VALUES (?, 'idle', ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            last_status = 'idle', last_run_id = excluded.last_run_id,
            cursor_json = excluded.cursor_json,
            warnings_count = excluded.warnings_count,
            last_warning_json = excluded.last_warning_json,
            updated_at = excluded.updated_at
        `)
            .run(
              input.sourceId,
              runId,
              cursorAfterJson,
              warnings.length,
              warningJson(warnings.at(-1) ?? null),
              completedAt,
            )
        }
        this.db
          .prepare(`
          UPDATE sync_runs
          SET status = 'completed', completed_at = ?, cursor_after_json = ?,
              resources_added = ?, resources_updated = ?, resources_deleted = ?,
              warnings_count = ?, last_warning_json = ?,
              errors_count = 0, error_summary = NULL
          WHERE id = ?
        `)
          .run(
            completedAt,
            input.mode === 'diff' ? null : cursorAfterJson,
            added,
            updated,
            deleted,
            warnings.length,
            warningJson(warnings.at(-1) ?? null),
            runId,
          )
        this.db
          .prepare(
            "DELETE FROM sync_locks WHERE scope = 'global' AND run_id = ?",
          )
          .run(runId)
      })()

      return {
        runId,
        mode: input.mode,
        status: 'completed',
        added,
        updated,
        deleted,
        warningsCount: warnings.length,
        lastWarning: warnings.at(-1) ?? null,
        errorsCount: 0,
        warnings,
      }
    } catch (cause) {
      const completedAt = Date.now()
      const lastError = bounded(
        cause instanceof Error ? cause.message : String(cause),
      )
      let runStatus: 'failed' | 'cancelled' = 'failed'
      let lastStatus: 'needs_auth' | 'failed' = 'failed'
      if (cause instanceof CtxindexSyncError) {
        const mapping = mapSyncErrorCode(cause.code)
        runStatus = mapping.runStatus
        lastStatus =
          mapping.lastStatus === 'needs_auth' ? 'needs_auth' : 'failed'
      } else if (
        cause instanceof CtxindexAuthError &&
        (cause.code === 'needs_auth' || cause.code === 'invalid_grant')
      ) {
        lastStatus = 'needs_auth'
      }
      this.db.transaction(() => {
        this.db
          .prepare(`
          UPDATE sync_runs
          SET status = ?, completed_at = ?, warnings_count = ?,
              last_warning_json = ?, errors_count = 1, error_summary = ?
          WHERE id = ?
        `)
          .run(
            runStatus,
            completedAt,
            warnings.length,
            warningJson(warnings.at(-1) ?? null),
            lastError,
            runId,
          )
        if (input.mode !== 'diff') {
          this.db
            .prepare(`
          INSERT INTO source_sync_state (
            source_id, last_status, last_run_id, cursor_json, warnings_count,
            last_warning_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            last_status = excluded.last_status, last_run_id = excluded.last_run_id,
            warnings_count = excluded.warnings_count,
            last_warning_json = excluded.last_warning_json,
            updated_at = excluded.updated_at
        `)
            .run(
              input.sourceId,
              lastStatus,
              runId,
              cursorBeforeJson,
              warnings.length,
              warningJson(warnings.at(-1) ?? null),
              completedAt,
            )
        }
        this.db
          .prepare(
            "DELETE FROM sync_locks WHERE scope = 'global' AND run_id = ?",
          )
          .run(runId)
      })()
      if (typeof cause === 'object' && cause !== null) {
        failureDiagnostics.set(cause, {
          warningsCount: warnings.length,
          lastWarning: warnings.at(-1) ?? null,
          errorsCount: 1,
          lastError,
        })
      }
      throw cause
    }
  }
}
