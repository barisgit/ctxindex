/**
 * Charter f06-sync-service tests.
 *
 * Covers VAL-CORE-SYNC-SERVICE and matches plan check filters:
 *   - bun test -t 'runSync'
 *   - bun test -t 'exit code'
 *   - bun test -t 'lock recovery|reauth|exit codes'
 *   - bun test -t 'AbortSignal'
 */
import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import { ulid } from 'ulid'
import { z } from 'zod'
import type { AuthService, GoogleGrantRow } from '../auth/types'
import { getEnv } from '../config'
import { CtxindexAuthError, CtxindexSyncError } from '../errors'
import type { Logger } from '../logger'
import type { SourceAdapterDefinition, SyncFunction } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { runSync as runSyncViaBarrel } from './index'
import {
  createSyncService,
  type SyncAdapterRegistry,
  type SyncDependencies,
} from './service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const silentLogger: Logger = {
  child() {
    return silentLogger
  },
  info() {},
  debug() {},
  warn() {},
  error() {},
  trace() {},
  fatal() {},
} as unknown as Logger

class StubAuthService implements AuthService {
  constructor(
    private readonly opts: {
      readonly grant?: GoogleGrantRow | null
      readonly refreshError?: unknown
      readonly accessToken?: string
    } = {},
  ) {}

  async addGoogleGrant(): Promise<never> {
    throw new Error('not used in tests')
  }

  async getActiveGoogleGrant(): Promise<GoogleGrantRow | null> {
    return this.opts.grant ?? null
  }

  async getGoogleGrantById(grantId: string): Promise<GoogleGrantRow | null> {
    const grant = this.opts.grant ?? null
    return grant?.id === grantId ? grant : null
  }

  async listGoogleGrants() {
    return []
  }

  async refreshGoogleAccessToken(): Promise<string> {
    if (this.opts.refreshError) throw this.opts.refreshError
    return this.opts.accessToken ?? 'access-token'
  }

  async exchangeGoogleAuthCode(): Promise<never> {
    throw new Error('not used in tests')
  }
}

function makeAdapter(id: string, fn: SyncFunction): SourceAdapterDefinition {
  return {
    id,
    provider: 'local',
    label: 'mock',
    schema: {},
    capabilities: {
      kinds: ['directory'],
      modes: ['sync', 'resync', 'diff'],
      supportsResume: true,
      supportsAttachments: false,
      supportsRawRecords: false,
      supportsRealm: true,
    },
    migrations: {
      namespace: id,
      migrationsFolder: '',
      migrationsTable: `ctxindex_migrations_${id.replaceAll('.', '_')}`,
    },
    auth: { kind: 'none' },
    sync: fn,
    searchMode: 'indexed',
    configSchema: z.unknown(),
  } as SourceAdapterDefinition
}

function makeRegistry(
  adapters: Record<string, SourceAdapterDefinition>,
): SyncAdapterRegistry {
  return {
    isKnownAdapter(id: string): boolean {
      return id in adapters
    },
    getAdapter(id: string): SourceAdapterDefinition {
      const a = adapters[id]
      if (!a) throw new Error(`adapter not found: ${id}`)
      return a
    },
  }
}

function seedGlobalRealm(d: Database): void {
  d.prepare(
    "INSERT OR IGNORE INTO realms (id, slug, is_default, created_at) VALUES ('global', 'global', 1, ?)",
  ).run(Date.now())
}

function insertSource(d: Database, adapterId: string): string {
  const id = ulid()
  d.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, 'global', adapterId, Date.now())
  return id
}

function makeDeps(
  db: Database,
  adapters: Record<string, SourceAdapterDefinition>,
  overrides: Partial<SyncDependencies> = {},
): SyncDependencies {
  return {
    db,
    logger: silentLogger,
    env: getEnv(),
    authService: new StubAuthService(),
    registry: makeRegistry(adapters),
    ...overrides,
  }
}

let db: Database

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

// ---------------------------------------------------------------------------
// runSync — applies operations and exits 0
// ---------------------------------------------------------------------------

test('runSync with mock adapter applies operations and exits 0', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.basic')

  const adapter = makeAdapter('mock.basic', async function* () {
    yield {
      type: 'upsertItem',
      itemId: 'item-1',
      uri: 'mock://item-1',
      title: 'Item One',
      kind: 'directory',
    }
    yield {
      type: 'upsertChunk',
      itemId: 'item-1',
      chunkIndex: 0,
      content: 'hello world',
    }
    yield { type: 'checkpoint', cursor: '{"page":1}' }
    yield { type: 'setCursor', cursor: '{"page":2}' }
  })

  const svc = createSyncService(makeDeps(db, { 'mock.basic': adapter }))
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('success')
  expect(result.exitCode).toBe(0)
  expect(result.lastStatus).toBe('completed')
  expect(result.counts.items).toBe(1)
  expect(result.counts.chunks).toBe(1)

  const run = db
    .prepare(
      'SELECT status, items_added, errors_count FROM sync_runs WHERE id = ?',
    )
    .get(result.runId) as {
    status: string
    items_added: number
    errors_count: number
  }
  expect(run.status).toBe('completed')
  expect(run.items_added).toBe(1)
  expect(run.errors_count).toBe(0)

  const items = db
    .prepare('SELECT id, title FROM items WHERE source_id = ?')
    .all(sourceId) as { id: string; title: string | null }[]
  expect(items.length).toBe(1)
  expect(items[0]?.title).toBe('Item One')

  const chunks = db
    .prepare(
      'SELECT content FROM item_chunks WHERE item_id = ? ORDER BY chunk_index',
    )
    .all('item-1') as { content: string }[]
  expect(chunks.length).toBe(1)
  expect(chunks[0]?.content).toBe('hello world')

  const state = db
    .prepare(
      'SELECT cursor_json, last_status FROM source_sync_state WHERE source_id = ?',
    )
    .get(sourceId) as { cursor_json: string; last_status: string }
  expect(state.cursor_json).toBe('{"page":2}')
  expect(state.last_status).toBe('completed')

  const checkpoints = db
    .prepare('SELECT cursor_json FROM sync_run_checkpoints WHERE run_id = ?')
    .all(result.runId) as { cursor_json: string }[]
  expect(checkpoints.length).toBe(1)
  expect(checkpoints[0]?.cursor_json).toBe('{"page":1}')

  const lock = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(lock).toBeNull()
})

test('runSync tombstones local files missing from a completed scan', async () => {
  seedGlobalRealm(db)
  db.exec(`CREATE TABLE local_directory_file_state (
    source_id TEXT NOT NULL REFERENCES sources(id), item_id TEXT NOT NULL REFERENCES items(id),
    relative_path TEXT NOT NULL, content_hash TEXT, mtime_ms INTEGER, size_bytes INTEGER,
    PRIMARY KEY (source_id, relative_path)
  )`)
  const sourceId = insertSource(db, 'local.directory')
  let scan = 1
  const adapter = makeAdapter('local.directory', async function* () {
    const paths = scan++ === 1 ? ['removed.md', 'kept.md'] : ['kept.md']
    for (const relativePath of paths) {
      yield {
        type: 'upsertItem',
        itemId: ulid(),
        uri: `file:///${relativePath}`,
        title: relativePath,
        kind: 'file',
        relativePath,
      }
    }
    yield { type: 'setCursor', cursor: { completedAt: scan } }
  })
  const svc = createSyncService(makeDeps(db, { 'local.directory': adapter }))

  await svc.runSync({ sourceId })
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('success')
  expect(result.counts.tombstones).toBe(1)
  const items = db
    .prepare(
      'SELECT title, deleted_at FROM items WHERE source_id = ? ORDER BY title',
    )
    .all(sourceId) as { title: string; deleted_at: number | null }[]
  expect(items).toHaveLength(2)
  expect(items[0]).toMatchObject({ title: 'kept.md', deleted_at: null })
  expect(items[1]?.title).toBe('removed.md')
  expect(items[1]?.deleted_at).toBeNumber()
  expect(
    db
      .prepare('SELECT COUNT(*) AS count FROM tombstones WHERE source_id = ?')
      .get(sourceId),
  ).toEqual({ count: 1 })
})

test('runSync does not tombstone local files when a scan fails', async () => {
  seedGlobalRealm(db)
  db.exec(`CREATE TABLE local_directory_file_state (
    source_id TEXT NOT NULL REFERENCES sources(id), item_id TEXT NOT NULL REFERENCES items(id),
    relative_path TEXT NOT NULL, content_hash TEXT, mtime_ms INTEGER, size_bytes INTEGER,
    PRIMARY KEY (source_id, relative_path)
  )`)
  const sourceId = insertSource(db, 'local.directory')
  let fail = false
  const adapter = makeAdapter('local.directory', async function* () {
    yield {
      type: 'upsertItem',
      itemId: ulid(),
      uri: 'file:///kept.md',
      title: 'kept.md',
      kind: 'file',
      relativePath: 'kept.md',
    }
    if (fail)
      throw new CtxindexSyncError('walk failed', 'provider_bad_response')
    yield {
      type: 'upsertItem',
      itemId: ulid(),
      uri: 'file:///still-present.md',
      title: 'still-present.md',
      kind: 'file',
      relativePath: 'still-present.md',
    }
    yield { type: 'setCursor', cursor: { completedAt: 1 } }
  })
  const svc = createSyncService(makeDeps(db, { 'local.directory': adapter }))

  await svc.runSync({ sourceId })
  fail = true
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('failure')
  expect(result.counts.tombstones).toBe(0)
  expect(
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM items WHERE source_id = ? AND deleted_at IS NULL',
      )
      .get(sourceId),
  ).toEqual({ count: 2 })
  expect(
    db
      .prepare('SELECT COUNT(*) AS count FROM tombstones WHERE source_id = ?')
      .get(sourceId),
  ).toEqual({ count: 0 })
})

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

function errorAdapter(id: string, code: string) {
  return makeAdapter(id, async function* () {
    if (Date.now() < 0) yield { type: 'never' }
    throw Object.assign(new Error(`adapter error: ${code}`), { code })
  })
}

test('exit code mapping: needs_auth → 10, network → 30, invalid_arg → 40', async () => {
  // needs_auth → 10
  seedGlobalRealm(db)
  const sourceA = insertSource(db, 'mock.needs_auth')
  const svcA = createSyncService(
    makeDeps(db, {
      'mock.needs_auth': errorAdapter('mock.needs_auth', 'needs_auth'),
    }),
  )
  const resA = await svcA.runSync({ sourceId: sourceA })
  expect(resA.exitCode).toBe(10)
  expect(resA.status).toBe('needs_auth')
  expect(resA.lastStatus).toBe('needs_auth')

  // network → 30
  const sourceB = insertSource(db, 'mock.network')
  const svcB = createSyncService(
    makeDeps(db, {
      'mock.network': errorAdapter('mock.network', 'network_error'),
    }),
  )
  const resB = await svcB.runSync({ sourceId: sourceB })
  expect(resB.exitCode).toBe(30)
  expect(resB.status).toBe('failure')

  // invalid_arg → 40
  const sourceC = insertSource(db, 'mock.invalid_arg')
  const svcC = createSyncService(
    makeDeps(db, {
      'mock.invalid_arg': errorAdapter('mock.invalid_arg', 'invalid_arg'),
    }),
  )
  const resC = await svcC.runSync({ sourceId: sourceC })
  expect(resC.exitCode).toBe(40)
  expect(resC.status).toBe('failure')
})

test('barrel runSync export uses sync service API', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.barrel')
  const adapter = makeAdapter('mock.barrel', async function* () {
    yield {
      type: 'upsertItem',
      itemId: 'item-barrel',
      uri: 'mock://item-barrel',
      title: 'barrel',
      kind: 'directory',
    }
  })

  const result = await runSyncViaBarrel(
    makeDeps(db, { 'mock.barrel': adapter }),
    { sourceId },
  )

  expect(result.status).toBe('success')
  expect(result.counts.items).toBe(1)
})

test('busy lock records and returns cancelled status', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.busy')
  const liveRunId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, 'global', 'sync', 'running', ?)`,
  ).run(liveRunId, sourceId, Date.now())
  db.prepare(
    `INSERT INTO sync_locks (scope, run_id, pid, acquired_at, released_at)
     VALUES ('global', ?, ?, ?, NULL)`,
  ).run(liveRunId, process.pid, Date.now())

  const adapter = makeAdapter('mock.busy', async function* () {
    yield {
      type: 'upsertItem',
      itemId: 'should-not-run',
      uri: 'mock://should-not-run',
    }
  })
  const svc = createSyncService(makeDeps(db, { 'mock.busy': adapter }))
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('cancelled')
  expect(result.exitCode).toBe(50)

  const run = db
    .prepare('SELECT status FROM sync_runs WHERE id = ?')
    .get(result.runId) as { status: string }
  expect(run.status).toBe('cancelled')
})

test('invalid operation schema returns invalid_arg exit 40', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.invalid-op')
  const adapter = makeAdapter('mock.invalid-op', async function* () {
    yield { type: 'upsertItem' }
  })
  const svc = createSyncService(makeDeps(db, { 'mock.invalid-op': adapter }))
  const result = await svc.runSync({ sourceId })

  expect(result.exitCode).toBe(40)
  expect(result.error?.code).toBe('invalid_arg')

  const items = db
    .prepare('SELECT id FROM items WHERE source_id = ?')
    .all(sourceId)
  expect(items.length).toBe(0)
})

test('nullable google mail fields are accepted by operation validation', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.gmail-nullables')
  const adapter = makeAdapter('mock.gmail-nullables', async function* () {
    yield {
      type: 'upsertItem',
      itemId: 'item-mail',
      uri: 'gmail:message-1',
      title: 'message',
      kind: 'mailbox',
    }
    yield {
      type: 'upsertMailMessage',
      itemId: 'item-mail',
      messageId: 'message-1',
      subject: 'message',
      from: null,
      to: null,
    }
    yield {
      type: 'upsertMailAttachment',
      itemId: 'item-mail',
      filename: 'empty.txt',
      mimeType: 'text/plain',
      sizeBytes: null,
      providerAttachmentId: null,
    }
  })
  const svc = createSyncService(
    makeDeps(db, { 'mock.gmail-nullables': adapter }),
  )
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('success')
  expect(result.exitCode).toBe(0)

  const message = db
    .prepare('SELECT from_address FROM mail_messages WHERE item_id = ?')
    .get('item-mail') as { from_address: string | null }
  expect(message.from_address).toBeNull()
})

test('google-style item_added canary does not double count an upserted item', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.google-canary')
  const adapter = makeAdapter('mock.google-canary', async function* () {
    yield {
      type: 'upsertItem',
      itemId: 'item-google',
      uri: 'mock://item-google',
      title: 'google',
      kind: 'directory',
    }
    yield { type: 'item_added', itemId: 'item-google' }
  })
  const svc = createSyncService(makeDeps(db, { 'mock.google-canary': adapter }))
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('success')
  expect(result.counts.items).toBe(1)

  const run = db
    .prepare('SELECT items_added FROM sync_runs WHERE id = ?')
    .get(result.runId) as { items_added: number }
  expect(run.items_added).toBe(1)
})

// ---------------------------------------------------------------------------
// Lock recovery from dead pid
// ---------------------------------------------------------------------------

test('lock recovery from dead pid acquires the lock', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.noop')

  // Plant a stale lock pointing at a dead PID with a sync_run still 'running'
  const staleRunId = ulid()
  db.prepare(
    `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
     VALUES (?, ?, 'global', 'sync', 'running', ?)`,
  ).run(staleRunId, sourceId, Date.now() - 60_000)
  // PID 1 (init, kill(0) yields EPERM on Unix → "alive") would be wrong;
  // use a very high PID that is overwhelmingly unlikely to be allocated
  // so pidIsAlive returns false and the lock is reaped.
  db.prepare(
    `INSERT INTO sync_locks (scope, run_id, pid, acquired_at, released_at)
     VALUES ('global', ?, ?, ?, NULL)`,
  ).run(staleRunId, 0x7ffffffe, Date.now() - 60_000)

  const adapter = makeAdapter('mock.noop', async function* () {
    if (Date.now() < 0) yield { type: 'never' }
  })

  const svc = createSyncService(makeDeps(db, { 'mock.noop': adapter }))
  const result = await svc.runSync({ sourceId })

  expect(result.status).toBe('success')
  expect(result.exitCode).toBe(0)

  // Stale run should have been moved off 'running'
  const stale = db
    .prepare('SELECT status FROM sync_runs WHERE id = ?')
    .get(staleRunId) as { status: string }
  expect(stale.status).not.toBe('running')

  // Lock released after success
  const lock = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(lock).toBeNull()
})

// ---------------------------------------------------------------------------
// Reauth path returns exit 10 with lastStatus=needs_auth
// ---------------------------------------------------------------------------

test('reauth path returns exit 10 with lastStatus=needs_auth', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'google.mailbox')
  db.prepare(
    `INSERT INTO accounts (id, realm_id, provider, display_name, email, created_at)
     VALUES ('acct-1', 'global', 'google', 'Test', 'test@example.com', ?)`,
  ).run(Date.now())
  db.prepare(
    `INSERT INTO grants (id, account_id, provider, scopes, refresh_token_ref, created_at, updated_at)
     VALUES ('grant-1', 'acct-1', 'google', 'gmail.readonly', 'secret:test', ?, ?)`,
  ).run(Date.now(), Date.now())
  db.prepare('UPDATE sources SET grant_id = ? WHERE id = ?').run(
    'grant-1',
    sourceId,
  )

  const adapter = makeAdapter('google.mailbox', async function* () {
    if (Date.now() < 0) yield { type: 'never' }
    throw new Error('should not reach adapter because auth refresh fails')
  })

  const authService = new StubAuthService({
    grant: {
      id: 'grant-1',
      accountId: 'acct-1',
      provider: 'google',
      scopes: 'https://www.googleapis.com/auth/gmail.readonly',
      accessTokenRef: null,
      refreshTokenRef: 'keychain:ctxindex/google/refresh',
      clientIdRef: 'keychain:ctxindex/google/client_id',
      clientSecretRef: 'keychain:ctxindex/google/client_secret',
      expiresAt: null,
      createdAt: 0,
      updatedAt: 0,
    },
    refreshError: new CtxindexAuthError(
      'invalid_grant',
      'token has been revoked',
    ),
  })

  const svc = createSyncService(
    makeDeps(db, { 'google.mailbox': adapter }, { authService }),
  )
  const result = await svc.runSync({ sourceId })

  expect(result.exitCode).toBe(10)
  expect(result.status).toBe('needs_auth')
  expect(result.lastStatus).toBe('needs_auth')
  expect(result.error?.code).toBe('invalid_grant')

  const state = db
    .prepare(
      'SELECT last_status, cursor_json FROM source_sync_state WHERE source_id = ?',
    )
    .get(sourceId) as { last_status: string; cursor_json: string | null }
  expect(state.last_status).toBe('needs_auth')
})

// ---------------------------------------------------------------------------
// AbortSignal cancels and returns exit 130
// ---------------------------------------------------------------------------

test('AbortSignal cancels and returns exit 130', async () => {
  seedGlobalRealm(db)
  const sourceId = insertSource(db, 'mock.cancellable')

  const adapter = makeAdapter('mock.cancellable', async function* (ctx) {
    yield {
      type: 'upsertItem',
      itemId: 'item-1',
      uri: 'mock://item-1',
      title: 'first',
      kind: 'directory',
    }
    if (ctx.signal.aborted) {
      throw new CtxindexSyncError('sync cancelled', 'cancelled')
    }
    yield {
      type: 'upsertItem',
      itemId: 'item-2',
      uri: 'mock://item-2',
      title: 'second',
      kind: 'directory',
    }
  })

  // Pre-aborted signal: service must abort before invoking adapter or
  // mid-loop and return exit 130.
  const controller = new AbortController()
  controller.abort()

  const svc = createSyncService(makeDeps(db, { 'mock.cancellable': adapter }))
  const result = await svc.runSync({ sourceId, signal: controller.signal })

  expect(result.exitCode).toBe(130)
  expect(result.status).toBe('cancelled')
  // SPEC §12: a cancelled run is terminal non-completion -> last_status 'failed'
  // ('idle' is reserved for completed runs).
  expect(result.lastStatus).toBe('failed')

  // sync_runs row should be marked cancelled
  const run = db
    .prepare('SELECT status FROM sync_runs WHERE id = ?')
    .get(result.runId) as { status: string }
  expect(run.status).toBe('cancelled')

  // Lock released after cancellation
  const lock = db
    .prepare("SELECT * FROM sync_locks WHERE scope = 'global'")
    .get()
  expect(lock).toBeNull()
})
