import { ulid } from 'ulid'
import type { AuthService } from '../auth/types'
import type { getEnv } from '../config'
import { CtxindexAuthError, CtxindexSyncError } from '../errors'
import type { Logger } from '../logger'
import type {
  CtxindexAdapterRegistryHandle,
  SourceAdapterDefinition,
  SyncMode,
} from '../registry'
import type { CtxindexDatabase } from '../storage'
import {
  type ErrorMapping as CoreErrorMapping,
  EXIT_CODES,
  type ExitCode,
  mapSyncErrorCode,
} from './exit-codes'
import { SyncOperationSchema } from './operations'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SyncRunStatus =
  | 'success'
  | 'partial'
  | 'failure'
  | 'needs_auth'
  | 'cancelled'

export type SyncLastStatus =
  | 'idle'
  | 'completed'
  | 'syncing'
  | 'failed'
  | 'needs_auth'
  | 'disabled'

export interface SyncResult {
  readonly runId: string
  readonly sourceId: string
  readonly status: SyncRunStatus
  readonly exitCode: number
  readonly lastStatus: SyncLastStatus
  readonly counts: {
    readonly items: number
    readonly chunks: number
    readonly tombstones: number
  }
  readonly error?: { readonly code: string; readonly message: string }
}

// Minimal registry shape the sync service requires. Lets callers pass
// `CTXINDEX_ADAPTER_REGISTRY` (from `@ctxindex/adapters`) without
// re-exposing its parameterized handle type.
export interface SyncAdapterRegistry {
  isKnownAdapter(id: string): boolean
  getAdapter(id: string): SourceAdapterDefinition
}

export interface SyncDependencies {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
  readonly authService: AuthService
  readonly registry: SyncAdapterRegistry | CtxindexAdapterRegistryHandle<never>
  readonly clock?: () => number
  readonly signal?: AbortSignal
}

export interface RunSyncInput {
  readonly sourceId: string
  readonly mode?: SyncMode
  readonly signal?: AbortSignal
}

export interface RunAllSourcesInput {
  readonly mode?: SyncMode
  readonly signal?: AbortSignal
}

export interface SyncService {
  runSync(input: RunSyncInput): Promise<SyncResult>
  runAllSources(input?: RunAllSourcesInput): Promise<SyncResult[]>
}

// ---------------------------------------------------------------------------
// Exit-code mapping (CLI parity)
// ---------------------------------------------------------------------------

interface FullErrorMapping {
  readonly exitCode: number
  readonly runStatus: 'failed' | 'cancelled'
  readonly lastStatus: SyncLastStatus
  readonly resultStatus: SyncRunStatus
}

/**
 * Full code → exit mapping kept in parity with the CLI `mapSyncError`. This
 * is a superset of `mapSyncErrorCode` in `exit-codes.ts` (which is reused
 * by the existing core runner tests).
 */
export function mapSyncErrorToExitCode(code: string): FullErrorMapping {
  switch (code) {
    case 'auth_expired':
    case 'invalid_client':
    case 'auth_revoked':
    case 'invalid_grant':
    case 'needs_auth':
      return {
        exitCode: 10,
        runStatus: 'failed',
        lastStatus: 'needs_auth',
        resultStatus: 'needs_auth',
      }
    case 'conflict':
    case 'rate_limited':
    case 'ENOENT':
    case 'ENOTDIR':
    case 'EACCES':
    case 'EPERM':
      return {
        exitCode: 20,
        runStatus: 'failed',
        lastStatus: 'failed',
        resultStatus: 'failure',
      }
    case 'network':
    case 'network_error':
    case 'provider_bad_response':
    case 'provider_error':
    case 'provider_unavailable':
      return {
        exitCode: 30,
        runStatus: 'failed',
        lastStatus: 'failed',
        resultStatus: 'failure',
      }
    case 'permission_denied':
    case 'invalid_arg':
      return {
        exitCode: 40,
        runStatus: 'failed',
        lastStatus: 'disabled',
        resultStatus: 'failure',
      }
    case 'transient_provider':
      return {
        exitCode: 50,
        runStatus: 'failed',
        lastStatus: 'failed',
        resultStatus: 'failure',
      }
    case 'cancelled':
      return {
        exitCode: 130,
        runStatus: 'cancelled',
        lastStatus: 'idle',
        resultStatus: 'cancelled',
      }
    default:
      return {
        exitCode: 1,
        runStatus: 'failed',
        lastStatus: 'failed',
        resultStatus: 'failure',
      }
  }
}

export type { CoreErrorMapping, ExitCode }
// Re-export so callers can stay on the legacy mapping too if they need it.
export { EXIT_CODES, mapSyncErrorCode }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SourceRow {
  id: string
  realm_id: string
  adapter_id: string
  config_json: string | null
}

interface LockRow {
  run_id: string
  pid: number | null
}

const GLOBAL_LOCK_SCOPE = 'global'

function now(deps: SyncDependencies): number {
  return deps.clock ? deps.clock() : Date.now()
}

function parseConfig(configJson: string | null): Record<string, unknown> {
  if (!configJson) return {}
  try {
    const parsed = JSON.parse(configJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseCursorJson(cursorJson: string | null): Record<string, unknown> {
  if (!cursorJson) return {}
  try {
    const parsed = JSON.parse(cursorJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function tableColumns(db: CtxindexDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  return new Set(rows.map((r) => r.name))
}

function addColumnIfMissing(
  db: CtxindexDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  if (tableColumns(db, table).has(column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

function ensureSyncRuntimeColumns(db: CtxindexDatabase): void {
  addColumnIfMissing(db, 'sync_runs', 'released_at', 'released_at INTEGER')
  addColumnIfMissing(db, 'sync_locks', 'pid', 'pid INTEGER')
  addColumnIfMissing(db, 'sync_locks', 'released_at', 'released_at INTEGER')
}

function pidIsAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as { code?: string }).code === 'EPERM'
  }
}

function releaseStaleGlobalLock(db: CtxindexDatabase): boolean {
  ensureSyncRuntimeColumns(db)
  const lock = db
    .prepare(
      `SELECT run_id, pid FROM sync_locks
       WHERE scope = ? AND released_at IS NULL`,
    )
    .get(GLOBAL_LOCK_SCOPE) as LockRow | null
  if (!lock) return false

  const run = db
    .prepare('SELECT source_id, status FROM sync_runs WHERE id = ?')
    .get(lock.run_id) as { source_id: string; status: string } | null

  const stale = !run || run.status !== 'running' || !pidIsAlive(lock.pid)
  if (!stale) return false

  const ts = Date.now()
  if (run) {
    db.prepare(
      `UPDATE sync_runs
       SET status = CASE WHEN status = 'running' THEN 'failed' ELSE status END,
           completed_at = COALESCE(completed_at, ?),
           released_at = ?,
           error_json = COALESCE(error_json, ?)
       WHERE id = ?`,
    ).run(
      ts,
      ts,
      JSON.stringify({ error: 'stale lock recovered' }),
      lock.run_id,
    )
    db.prepare(
      `UPDATE source_sync_state
       SET last_status = CASE WHEN last_status = 'syncing' THEN 'failed' ELSE last_status END,
           updated_at = ?
       WHERE source_id = ? AND last_run_id = ?`,
    ).run(ts, run.source_id, lock.run_id)
  }
  db.prepare(
    `UPDATE sync_locks SET released_at = ?
     WHERE scope = ? AND run_id = ?`,
  ).run(ts, GLOBAL_LOCK_SCOPE, lock.run_id)
  db.prepare('DELETE FROM sync_locks WHERE scope = ?').run(GLOBAL_LOCK_SCOPE)
  return true
}

function acquireGlobalLock(db: CtxindexDatabase, runId: string): void {
  db.prepare(
    `INSERT INTO sync_locks (scope, run_id, pid, acquired_at, released_at)
     VALUES (?, ?, ?, ?, NULL)`,
  ).run(GLOBAL_LOCK_SCOPE, runId, process.pid, Date.now())
}

function releaseGlobalLock(db: CtxindexDatabase, runId: string): void {
  const ts = Date.now()
  db.prepare('UPDATE sync_runs SET released_at = ? WHERE id = ?').run(ts, runId)
  db.prepare(
    `UPDATE sync_locks SET released_at = ?
     WHERE scope = ? AND run_id = ?`,
  ).run(ts, GLOBAL_LOCK_SCOPE, runId)
  db.prepare('DELETE FROM sync_locks WHERE scope = ? AND run_id = ?').run(
    GLOBAL_LOCK_SCOPE,
    runId,
  )
}

function sourceRows(db: CtxindexDatabase, sourceId?: string): SourceRow[] {
  if (sourceId) {
    const row = db
      .prepare(
        'SELECT id, realm_id, adapter_id, config_json FROM sources WHERE id = ?',
      )
      .get(sourceId) as SourceRow | null
    return row ? [row] : []
  }
  return db
    .prepare(
      'SELECT id, realm_id, adapter_id, config_json FROM sources ORDER BY created_at',
    )
    .all() as SourceRow[]
}

function upsertSourceSyncState(
  db: CtxindexDatabase,
  sourceId: string,
  status: string,
  runId: string,
  cursorJson: string | null,
): void {
  db.prepare(
    `INSERT INTO source_sync_state (source_id, last_status, last_run_id, cursor_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       last_status=excluded.last_status,
       last_run_id=excluded.last_run_id,
       cursor_json=excluded.cursor_json,
       updated_at=excluded.updated_at`,
  ).run(sourceId, status, runId, cursorJson, Date.now())
}

function mapActualItemId(
  db: CtxindexDatabase,
  sourceId: string,
  relativePath: string | undefined,
  proposedItemId: string,
): { itemId: string; existing: boolean } {
  if (!relativePath) return { itemId: proposedItemId, existing: false }
  const existing = db
    .prepare(
      'SELECT item_id FROM local_directory_file_state WHERE source_id = ? AND relative_path = ?',
    )
    .get(sourceId, relativePath) as { item_id: string } | null
  if (!existing) return { itemId: proposedItemId, existing: false }
  return { itemId: existing.item_id, existing: true }
}

function tableExists(db: CtxindexDatabase, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | null
  return !!row
}

function applyItemOp(
  db: CtxindexDatabase,
  source: SourceRow,
  op: Record<string, unknown>,
): { itemId: string; existing: boolean } {
  const proposedItemId = String(op.itemId)
  const relativePath =
    typeof op.relativePath === 'string' ? op.relativePath : undefined
  const hasLocalDirState =
    relativePath !== undefined && tableExists(db, 'local_directory_file_state')
  const { itemId, existing } = hasLocalDirState
    ? mapActualItemId(db, source.id, relativePath, proposedItemId)
    : { itemId: proposedItemId, existing: false }
  const ts = Date.now()

  db.prepare(
    `INSERT INTO items
       (id, source_id, realm_id, adapter_id, kind, uri, title,
        content_hash, byte_size, indexed_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       uri=excluded.uri,
       title=excluded.title,
       kind=excluded.kind,
       content_hash=excluded.content_hash,
       byte_size=excluded.byte_size,
       updated_at=excluded.updated_at,
       deleted_at=NULL`,
  ).run(
    itemId,
    source.id,
    source.realm_id,
    source.adapter_id,
    typeof op.kind === 'string' ? op.kind : 'directory',
    typeof op.uri === 'string' ? op.uri : itemId,
    typeof op.title === 'string' ? op.title : null,
    typeof op.contentHash === 'string' ? op.contentHash : null,
    typeof op.byteSize === 'number' ? op.byteSize : null,
    typeof op.indexedAt === 'number' ? op.indexedAt : ts,
    ts,
  )

  db.prepare('DELETE FROM item_chunks WHERE item_id = ?').run(itemId)

  if (relativePath && hasLocalDirState) {
    db.prepare(
      `INSERT INTO local_directory_file_state
         (source_id, item_id, relative_path, content_hash, mtime_ms, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id, relative_path) DO UPDATE SET
         item_id=excluded.item_id,
         content_hash=excluded.content_hash,
         mtime_ms=excluded.mtime_ms,
         size_bytes=excluded.size_bytes`,
    ).run(
      source.id,
      itemId,
      relativePath,
      typeof op.contentHash === 'string' ? op.contentHash : null,
      typeof op.mtime === 'number' ? op.mtime : null,
      typeof op.byteSize === 'number' ? op.byteSize : null,
    )
  }

  return { itemId, existing }
}

function applyChunkOp(
  db: CtxindexDatabase,
  op: Record<string, unknown>,
  itemIdByAdapterItemId: Map<string, string>,
): void {
  const adapterItemId = String(op.itemId)
  const itemId = itemIdByAdapterItemId.get(adapterItemId) ?? adapterItemId
  const content = typeof op.content === 'string' ? op.content : ''
  db.prepare(
    `INSERT INTO item_chunks (id, item_id, chunk_index, content, byte_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    typeof op.chunkId === 'string' ? op.chunkId : ulid(),
    itemId,
    typeof op.chunkIndex === 'number' ? op.chunkIndex : 0,
    content,
    Buffer.byteLength(content),
    Date.now(),
  )
}

function jsonText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return JSON.stringify([value])
  if (Array.isArray(value)) return JSON.stringify(value)
  return JSON.stringify(value)
}

function applyMailMessageOp(
  db: CtxindexDatabase,
  op: Record<string, unknown>,
  mailMessageIdByItemId: Map<string, string>,
): void {
  const itemId = String(op.itemId)
  const id = ulid()
  mailMessageIdByItemId.set(itemId, id)
  db.prepare(
    `INSERT INTO mail_messages
       (id, item_id, message_id, thread_id, subject, from_address, to_addresses,
        cc_addresses, date, snippet, label_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    itemId,
    typeof op.messageId === 'string' ? op.messageId : null,
    typeof op.threadId === 'string' ? op.threadId : null,
    typeof op.subject === 'string' ? op.subject : null,
    typeof op.from === 'string' ? op.from : null,
    jsonText(op.to),
    jsonText(op.cc),
    typeof op.date === 'number' ? op.date : null,
    typeof op.snippet === 'string' ? op.snippet : null,
    jsonText(op.labelIds),
    Date.now(),
  )
}

function applyMailAttachmentOp(
  db: CtxindexDatabase,
  op: Record<string, unknown>,
  mailMessageIdByItemId: Map<string, string>,
): void {
  const itemId = String(op.itemId)
  const messageRowId = mailMessageIdByItemId.get(itemId)
  if (!messageRowId) return
  db.prepare(
    `INSERT INTO mail_attachments
       (id, message_id, filename, mime_type, size, attachment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    typeof op.attachmentId === 'string' ? op.attachmentId : ulid(),
    messageRowId,
    typeof op.filename === 'string' ? op.filename : 'attachment',
    typeof op.mimeType === 'string' ? op.mimeType : 'application/octet-stream',
    typeof op.sizeBytes === 'number' ? op.sizeBytes : null,
    typeof op.providerAttachmentId === 'string'
      ? op.providerAttachmentId
      : null,
    Date.now(),
  )
}

function applyExternalRefOp(
  db: CtxindexDatabase,
  op: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT INTO external_refs (id, item_id, kind, value, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    ulid(),
    String(op.itemId),
    typeof op.kind === 'string' ? op.kind : 'unknown',
    typeof op.value === 'string' ? op.value : JSON.stringify(op.value),
    Date.now(),
  )
}

function applyTombstoneOp(
  db: CtxindexDatabase,
  source: SourceRow,
  op: Record<string, unknown>,
): void {
  const itemId = String(op.itemId)
  const deletedAt = typeof op.deletedAt === 'number' ? op.deletedAt : Date.now()
  db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(
    deletedAt,
    itemId,
  )
  db.prepare(
    `INSERT INTO tombstones (id, item_id, source_id, deleted_at, reason)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    ulid(),
    itemId,
    source.id,
    deletedAt,
    typeof op.reason === 'string' ? op.reason : null,
  )
}

function applyCheckpointOp(
  db: CtxindexDatabase,
  runId: string,
  op: Record<string, unknown>,
): void {
  const cursorValue =
    typeof op.cursor === 'string'
      ? op.cursor
      : op.cursor !== undefined
        ? JSON.stringify(op.cursor)
        : '{}'
  db.prepare(
    `INSERT INTO sync_run_checkpoints (id, run_id, cursor_json, recorded_at)
     VALUES (?, ?, ?, ?)`,
  ).run(ulid(), runId, cursorValue, Date.now())
}

function applySetCursorOp(op: Record<string, unknown>): string | null {
  if (typeof op.cursor === 'string') return op.cursor
  if (op.cursor === null || op.cursor === undefined) return null
  return JSON.stringify(op.cursor)
}

function applyRawRecordOp(
  db: CtxindexDatabase,
  source: SourceRow,
  op: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT INTO raw_records (id, item_id, source_id, content_type, data, created_at)
     VALUES (?, ?, ?, 'application/json', ?, ?)`,
  ).run(
    ulid(),
    String(op.itemId),
    source.id,
    Buffer.from(JSON.stringify(op.payload ?? {})),
    Date.now(),
  )
}

function errorCode(err: unknown): string {
  if (err instanceof CtxindexSyncError) return err.code
  return (err as { code?: string }).code ?? 'unknown'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function cursorForAdapter(
  deps: SyncDependencies,
  source: SourceRow,
  config: Record<string, unknown>,
  cursorJson: string | null,
): Promise<unknown> {
  if (source.adapter_id !== 'google.mailbox') {
    return { config, previous: cursorJson }
  }

  const grant = await deps.authService.getActiveGoogleGrant()
  if (!grant) {
    throw new CtxindexSyncError(
      'google authorization required; run ctxindex auth add google',
      'auth_revoked',
    )
  }

  let accessToken: string
  try {
    accessToken = await deps.authService.refreshGoogleAccessToken(grant.id)
  } catch (err) {
    if (
      err instanceof CtxindexAuthError &&
      (err.code === 'invalid_grant' || err.code === 'invalid_client')
    ) {
      const friendly = new CtxindexAuthError(
        err.code,
        'google authorization expired or was revoked',
      )
      throw friendly
    }
    throw err
  }

  return {
    ...parseCursorJson(cursorJson),
    ...config,
    access_token: accessToken,
  }
}

function combinedSignal(
  primary?: AbortSignal,
  secondary?: AbortSignal,
): AbortSignal {
  if (primary && !secondary) return primary
  if (!primary && secondary) return secondary
  const controller = new AbortController()
  const a = primary
  const b = secondary
  const onAbort = (reason: unknown) => controller.abort(reason)
  if (a) {
    if (a.aborted) controller.abort(a.reason)
    else a.addEventListener('abort', () => onAbort(a.reason), { once: true })
  }
  if (b) {
    if (b.aborted) controller.abort(b.reason)
    else b.addEventListener('abort', () => onAbort(b.reason), { once: true })
  }
  return controller.signal
}

// ---------------------------------------------------------------------------
// Core run loop
// ---------------------------------------------------------------------------

async function runSourceSync(
  deps: SyncDependencies,
  source: SourceRow,
  mode: SyncMode,
  inputSignal?: AbortSignal,
): Promise<SyncResult> {
  const db = deps.db
  ensureSyncRuntimeColumns(db)
  releaseStaleGlobalLock(db)

  const existingLock = db
    .prepare(
      `SELECT run_id, pid FROM sync_locks
       WHERE scope = ? AND released_at IS NULL`,
    )
    .get(GLOBAL_LOCK_SCOPE) as LockRow | null

  if (existingLock) {
    const cancelledRunId = ulid()
    const ts = now(deps)
    db.prepare(
      `INSERT INTO sync_runs
         (id, source_id, realm_id, mode, status, started_at, completed_at, released_at, error_json)
       VALUES (?, ?, ?, ?, 'cancelled', ?, ?, ?, ?)`,
    ).run(
      cancelledRunId,
      source.id,
      source.realm_id,
      mode,
      ts,
      ts,
      ts,
      JSON.stringify({ error: 'sync busy' }),
    )
    return {
      runId: cancelledRunId,
      sourceId: source.id,
      status: 'cancelled',
      exitCode: 50,
      lastStatus: 'failed',
      counts: { items: 0, chunks: 0, tombstones: 0 },
      error: { code: 'transient_provider', message: 'sync busy' },
    }
  }

  const adapterId = source.adapter_id
  if (!deps.registry.isKnownAdapter(adapterId)) {
    throw new Error(`unknown adapter: ${adapterId}`)
  }
  const adapter = deps.registry.getAdapter(adapterId)
  const config = parseConfig(source.config_json)
  const currentState = db
    .prepare('SELECT cursor_json FROM source_sync_state WHERE source_id = ?')
    .get(source.id) as { cursor_json: string | null } | null
  const cursorJson = currentState?.cursor_json ?? null
  const runId = ulid()
  let itemsAdded = 0
  let itemsUpdated = 0
  let chunksWritten = 0
  let tombstonesWritten = 0
  let errorsCount = 0
  let cursorAfterJson: string | null = cursorJson
  const errorMessages: string[] = []
  const itemIdByAdapterItemId = new Map<string, string>()
  const mailMessageIdByItemId = new Map<string, string>()
  const runLogger = deps.logger.child({
    runId,
    sourceId: source.id,
    adapterId: source.adapter_id,
    realmId: source.realm_id,
    op: 'sync',
  })

  const startedAt = now(deps)
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, ?, ?, 'running', ?)`,
  ).run(runId, source.id, source.realm_id, mode, startedAt)
  upsertSourceSyncState(db, source.id, 'syncing', runId, cursorJson)
  acquireGlobalLock(db, runId)

  const abortController = new AbortController()
  const signal = combinedSignal(
    combinedSignal(deps.signal, inputSignal),
    abortController.signal,
  )

  try {
    // Check for already-aborted signal before doing any adapter work.
    if (signal.aborted) {
      throw Object.assign(new Error('sync cancelled'), { code: 'cancelled' })
    }

    const cursor = await cursorForAdapter(deps, source, config, cursorJson)
    const ctx = {
      sourceId: source.id,
      runId,
      mode,
      cursor,
      logger: runLogger,
      signal,
      rootPath:
        typeof config.root_path === 'string' ? config.root_path : undefined,
    }

    runLogger.info({ mode }, 'sync started')

    for await (const rawOp of adapter.sync(ctx)) {
      if (signal.aborted) {
        throw Object.assign(new Error('sync cancelled'), { code: 'cancelled' })
      }
      const op = rawOp as Record<string, unknown>
      const type = op.type
      if (
        type !== 'item_added' &&
        type !== 'item_updated' &&
        type !== 'item_deleted' &&
        type !== 'cursor'
      ) {
        const parsed = SyncOperationSchema.safeParse(op)
        if (!parsed.success) {
          throw Object.assign(
            new Error('invalid sync operation emitted by adapter'),
            { code: 'invalid_arg', cause: parsed.error },
          )
        }
      }
      if (type === 'upsertItem') {
        const { itemId, existing } = applyItemOp(db, source, op)
        itemIdByAdapterItemId.set(String(op.itemId), itemId)
        if (existing) itemsUpdated++
        else itemsAdded++
      } else if (type === 'upsertChunk') {
        applyChunkOp(db, op, itemIdByAdapterItemId)
        chunksWritten++
      } else if (type === 'upsertMailMessage') {
        applyMailMessageOp(db, op, mailMessageIdByItemId)
      } else if (type === 'upsertMailAttachment') {
        applyMailAttachmentOp(db, op, mailMessageIdByItemId)
      } else if (type === 'upsertExternalRef') {
        applyExternalRefOp(db, op)
      } else if (type === 'tombstone') {
        applyTombstoneOp(db, source, op)
        tombstonesWritten++
      } else if (type === 'rawRecord') {
        applyRawRecordOp(db, source, op)
      } else if (type === 'error') {
        errorsCount++
        if (typeof op.message === 'string') errorMessages.push(op.message)
      } else if (type === 'checkpoint') {
        applyCheckpointOp(db, runId, op)
      } else if (type === 'setCursor') {
        cursorAfterJson = applySetCursorOp(op)
      } else if (type === 'cancelled') {
        errorsCount++
        errorMessages.push('sync cancelled')
      }
      // Legacy runner-style ops are ignored here. The full service counts the
      // database-applying operations above; counting both would double-count
      // adapters (notably google.mailbox) that emit item_added canaries.
    }

    db.prepare(
      `UPDATE sync_runs SET
         status='completed', completed_at=?, items_added=?, items_updated=?,
         items_deleted=?, errors_count=?, error_json=?
       WHERE id=?`,
    ).run(
      Date.now(),
      itemsAdded,
      itemsUpdated,
      tombstonesWritten,
      errorsCount,
      errorMessages.length > 0 ? JSON.stringify(errorMessages) : null,
      runId,
    )
    upsertSourceSyncState(db, source.id, 'completed', runId, cursorAfterJson)
    releaseGlobalLock(db, runId)
    runLogger.info(
      {
        itemsAdded,
        itemsUpdated,
        chunksWritten,
        tombstonesWritten,
        errorsCount,
      },
      'sync completed',
    )

    return {
      runId,
      sourceId: source.id,
      status: errorsCount > 0 ? 'partial' : 'success',
      exitCode: errorsCount > 0 ? 20 : 0,
      lastStatus: 'completed',
      counts: {
        items: itemsAdded + itemsUpdated,
        chunks: chunksWritten,
        tombstones: tombstonesWritten,
      },
    }
  } catch (err) {
    const message = errorMessage(err)
    const code = errorCode(err)
    const mapping = mapSyncErrorToExitCode(code)
    errorMessages.push(message)
    errorsCount++

    db.prepare(
      `UPDATE sync_runs SET
         status=?, completed_at=?, items_added=?, items_updated=?,
         items_deleted=?, errors_count=?, error_json=?
       WHERE id=?`,
    ).run(
      mapping.runStatus,
      Date.now(),
      itemsAdded,
      itemsUpdated,
      tombstonesWritten,
      errorsCount,
      JSON.stringify({ error: message, code }),
      runId,
    )
    upsertSourceSyncState(db, source.id, mapping.lastStatus, runId, cursorJson)
    releaseGlobalLock(db, runId)
    runLogger.error(
      { err: message, code, exitCode: mapping.exitCode },
      'sync failed',
    )

    return {
      runId,
      sourceId: source.id,
      status: mapping.resultStatus,
      exitCode: mapping.exitCode,
      lastStatus: mapping.lastStatus,
      counts: {
        items: itemsAdded + itemsUpdated,
        chunks: chunksWritten,
        tombstones: tombstonesWritten,
      },
      error: { code, message },
    }
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function runSync(
  deps: SyncDependencies,
  input: RunSyncInput,
): Promise<SyncResult> {
  return createSyncService(deps).runSync(input)
}

export function runAllSources(
  deps: SyncDependencies,
  input: RunAllSourcesInput = {},
): Promise<SyncResult[]> {
  return createSyncService(deps).runAllSources(input)
}

export function createSyncService(deps: SyncDependencies): SyncService {
  return {
    async runSync(input: RunSyncInput): Promise<SyncResult> {
      const rows = sourceRows(deps.db, input.sourceId)
      const row = rows[0]
      if (!row) {
        throw new Error(`source not found: "${input.sourceId}"`)
      }
      return runSourceSync(deps, row, input.mode ?? 'sync', input.signal)
    },

    async runAllSources(input: RunAllSourcesInput = {}): Promise<SyncResult[]> {
      const rows = sourceRows(deps.db)
      const results: SyncResult[] = []
      for (const row of rows) {
        if ((deps.signal ?? input.signal)?.aborted) {
          results.push({
            runId: ulid(),
            sourceId: row.id,
            status: 'cancelled',
            exitCode: 130,
            lastStatus: 'idle',
            counts: { items: 0, chunks: 0, tombstones: 0 },
            error: { code: 'cancelled', message: 'sync cancelled' },
          })
          continue
        }
        results.push(
          await runSourceSync(deps, row, input.mode ?? 'sync', input.signal),
        )
      }
      return results
    },
  }
}
