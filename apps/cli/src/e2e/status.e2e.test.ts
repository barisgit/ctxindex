import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

type StatusRow = {
  sourceId: string
  adapterId: string
  realmSlug: string
  availability: 'available' | 'extension_unavailable'
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
  const realm = await sandbox.run(['realm', 'add', 'work'])
  expect(realm.exitCode, realm.stderr).toBe(0)
  return sandbox
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function addSource(
  sandbox: Sandbox,
  name: string = crypto.randomUUID(),
): Promise<string> {
  const root = join(sandbox.dir, name)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'note.txt'), `status fixture ${name}\n`)
  const result = await sandbox.run([
    'source',
    'add',
    'local.directory',
    '--realm',
    'work',
    '--root',
    root,
  ])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toBe('')
  return parseSourceId(result.stdout)
}

async function syncSource(sandbox: Sandbox, sourceId: string): Promise<void> {
  const result = await sandbox.run(['sync', '--source', sourceId, '--json'])
  expect(result.exitCode, result.stderr).toBe(0)
}

function markAdapterUnavailable(sandbox: Sandbox, sourceId: string): void {
  const db = new Database(dbPath(sandbox))
  try {
    db.prepare(
      "UPDATE sources SET adapter_id = 'missing.adapter', adapter_version = 1 WHERE id = ?",
    ).run(sourceId)
  } finally {
    db.close()
  }
}

function syncRunErrorCount(sandbox: Sandbox, sourceId: string): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare(
        'SELECT errors_count AS errorsCount FROM sync_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT 1',
      )
      .get(sourceId) as { errorsCount: number }
    return row.errorsCount
  } finally {
    db.close()
  }
}

function sourceCount(sandbox: Sandbox): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM sources').get() as {
      count: number
    }
    return row.count
  } finally {
    db.close()
  }
}

function parseStatusRows(stdout: string): StatusRow[] {
  return JSON.parse(stdout) as StatusRow[]
}

test('text output renders real completed local sync state', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    await syncSource(sandbox, sourceId)

    const result = await sandbox.run(['status'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(sourceId)
    expect(result.stdout).toContain('local.directory')
    expect(result.stdout).toContain('work')
    expect(result.stdout).toContain('idle')
  } finally {
    await sandbox.cleanup()
  }
})

test('compact output includes a real unavailable-Adapter failure summary', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    markAdapterUnavailable(sandbox, sourceId)
    const sync = await sandbox.run(['sync', '--source', sourceId])
    expect(sync.exitCode).toBe(50)

    const result = await sandbox.run(['status', '--format', 'compact'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(sourceId)
    expect(result.stdout).toContain('adapter=missing.adapter')
    expect(result.stdout).toContain('status=extension_unavailable')
    expect(result.stdout).toContain('errors=0')
    expect(result.stdout).toContain(
      'error=Source_Adapter_definition_is_unavailable',
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('json output reflects the generic cursor from a real sync', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    await syncSource(sandbox, sourceId)

    const result = await sandbox.run(['status', '--json'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    const rows = parseStatusRows(result.stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      sourceId,
      adapterId: 'local.directory',
      realmSlug: 'work',
      availability: 'available',
      lastStatus: 'idle',
      lastRunAt: expect.any(Number),
      errorsCount: 0,
      lastError: null,
      cursor: {
        version: 1,
        files: [expect.objectContaining({ path: 'note.txt' })],
      },
    })
  } finally {
    await sandbox.cleanup()
  }
})

test('counts match fresh-schema SQLite state', async () => {
  const sandbox = await initSandbox()
  try {
    const firstSourceId = await addSource(sandbox, 'first')
    const secondSourceId = await addSource(sandbox, 'second')
    await syncSource(sandbox, firstSourceId)
    await syncSource(sandbox, secondSourceId)

    const result = await sandbox.run(['status', '--json'])
    const rows = parseStatusRows(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(rows.length).toBe(sourceCount(sandbox))
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

test('reports derived unavailability separately from failed sync status', async () => {
  const sandbox = await initSandbox()
  try {
    const sourceId = await addSource(sandbox)
    markAdapterUnavailable(sandbox, sourceId)
    const sync = await sandbox.run(['sync', '--source', sourceId, '--json'])
    expect(sync.exitCode).toBe(50)

    const rows = parseStatusRows(
      (await sandbox.run(['status', '--json'])).stdout,
    )
    expect(rows[0]?.sourceId).toBe(sourceId)
    expect(rows[0]?.availability).toBe('extension_unavailable')
    expect(rows[0]?.lastStatus).toBe('failed')
  } finally {
    await sandbox.cleanup()
  }
})
