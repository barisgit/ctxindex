import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

type StatusRow = {
  sourceId: string
  adapterId: string
  realmSlug: string
  lastStatus: string
  lastRunAt: number | null
  errorsCount: number
  lastError: string | null
  cursor: unknown
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

async function initSandbox(): Promise<Sandbox> {
  const sandbox = await createSandbox()
  const init = await sandbox.run(['init'])
  expect(init.exitCode).toBe(0)
  expect(init.stderr).toBe('')
  return sandbox
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function addSource(sandbox: Sandbox): Promise<string> {
  const result = await sandbox.run(['source', 'add', 'local.directory'])
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  return parseSourceId(result.stdout)
}

function seedSyncState(
  sandbox: Sandbox,
  sourceId: string,
  lastStatus = 'completed',
): void {
  const now = Date.now()
  const runId = `run-${sourceId}-${lastStatus}`
  const errorsCount = lastStatus === 'completed' ? 0 : 1
  const db = new Database(dbPath(sandbox))
  try {
    const source = db
      .prepare('SELECT realm_id FROM sources WHERE id = ?')
      .get(sourceId) as { realm_id: string } | null
    if (!source) throw new Error(`source not found: ${sourceId}`)

    db.prepare(
      `INSERT OR REPLACE INTO sync_runs (
        id,
        source_id,
        realm_id,
        mode,
        status,
        started_at,
        completed_at,
        items_added,
        items_updated,
        items_deleted,
        errors_count,
        error_json
      ) VALUES (?, ?, ?, 'sync', ?, ?, ?, 1, 0, 0, ?, ?)`,
    ).run(
      runId,
      sourceId,
      source.realm_id,
      lastStatus === 'completed' ? 'completed' : 'failed',
      now - 1000,
      now,
      errorsCount,
      lastStatus === 'completed' ? null : JSON.stringify({ code: lastStatus }),
    )

    db.prepare(
      `INSERT OR REPLACE INTO source_sync_state (
        source_id,
        last_status,
        last_run_id,
        cursor_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    ).run(sourceId, lastStatus, runId, JSON.stringify({ page: 1 }), now)
  } finally {
    db.close()
  }
}

function syncRunErrorCount(sandbox: Sandbox, sourceId: string): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare(
        'SELECT errors_count AS errorsCount FROM sync_runs WHERE source_id = ?',
      )
      .get(sourceId) as { errorsCount: number }
    return row.errorsCount
  } finally {
    db.close()
  }
}

function sourceSyncStateCount(sandbox: Sandbox): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM source_sync_state')
      .get() as { count: number }
    return row.count
  } finally {
    db.close()
  }
}

function parseStatusRows(stdout: string): StatusRow[] {
  return JSON.parse(stdout) as StatusRow[]
}

test('text output renders', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    seedSyncState(sandbox, sourceId)

    const result = await sandbox.run(['status'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(sourceId)
    expect(result.stdout).toContain('local.directory')
    expect(result.stdout).toContain('global')
    expect(result.stdout).toContain('completed')
  } finally {
    await sandbox.cleanup()
  }
})

test('compact output includes error summary', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    seedSyncState(sandbox, sourceId, 'failed')

    const result = await sandbox.run(['status', '--format', 'compact'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(sourceId)
    expect(result.stdout).toContain('adapter=local.directory')
    expect(result.stdout).toContain('status=failed')
    expect(result.stdout).toContain('errors=1')
    expect(result.stdout).toContain('error=failed')
  } finally {
    await sandbox.cleanup()
  }
})

test('json output parses', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    seedSyncState(sandbox, sourceId)

    const result = await sandbox.run(['status', '--json'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')

    const rows = parseStatusRows(result.stdout)
    expect(rows.length).toBe(1)
    expect(rows[0]?.sourceId).toBe(sourceId)
    expect(rows[0]?.adapterId).toBe('local.directory')
    expect(rows[0]?.realmSlug).toBe('global')
    expect(rows[0]?.lastStatus).toBe('completed')
    expect(typeof rows[0]?.lastRunAt).toBe('number')
    expect(rows[0]?.errorsCount).toBe(0)
    expect(rows[0]?.lastError).toBeNull()
    expect(rows[0]?.cursor).toEqual({ page: 1 })
  } finally {
    await sandbox.cleanup()
  }
})

test('counts match SQLite', async () => {
  const sandbox = await initSandbox()
  try {
    const firstSourceId = await addSource(sandbox)
    const secondSourceId = await addSource(sandbox)
    seedSyncState(sandbox, firstSourceId)
    seedSyncState(sandbox, secondSourceId)

    const result = await sandbox.run(['status', '--json'])
    const rows = parseStatusRows(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(rows.length).toBe(sourceSyncStateCount(sandbox))
    const bySourceId = new Map(rows.map((row) => [row.sourceId, row]))
    expect(bySourceId.get(firstSourceId)?.errorsCount).toBe(
      syncRunErrorCount(sandbox, firstSourceId),
    )
    expect(bySourceId.get(secondSourceId)?.errorsCount).toBe(
      syncRunErrorCount(sandbox, secondSourceId),
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('unknown source id fails fast with exit 2', async () => {
  const sandbox = await initSandbox()
  try {
    const result = await sandbox.run(['status', '--source', 'no-such-source'])

    // SPEC §10b: a reference to an unknown source MUST fail fast, not exit 0.
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('no-such-source')
  } finally {
    await sandbox.cleanup()
  }
})

test('no sources still exits 0', async () => {
  const sandbox = await initSandbox()
  try {
    const result = await sandbox.run(['status', '--json'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(parseStatusRows(result.stdout)).toEqual([])
  } finally {
    await sandbox.cleanup()
  }
})

test('reports last_status after failed sync', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    seedSyncState(sandbox, sourceId, 'needs_auth')

    const result = await sandbox.run(['status', '--json'])
    const rows = parseStatusRows(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(rows[0]?.sourceId).toBe(sourceId)
    expect(rows[0]?.lastStatus).toBe('needs_auth')
  } finally {
    await sandbox.cleanup()
  }
})
