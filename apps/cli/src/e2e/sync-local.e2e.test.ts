import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

async function addLocalSourceWithPath(
  sandbox: Sandbox,
  root: string,
): Promise<string> {
  const result = await sandbox.run([
    'source',
    'add',
    'local.directory',
    '--realm',
    'global',
    '--path',
    root,
  ])
  expect(result.stderr).toBe('')
  expect(result.exitCode).toBe(0)
  return parseSourceId(result.stdout)
}

async function withInitializedSandbox(
  fn: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
  const sandbox = await createSandbox()
  try {
    const init = await sandbox.run(['init'])
    expect(init.stderr).toBe('')
    expect(init.exitCode).toBe(0)
    await fn(sandbox)
  } finally {
    await sandbox.cleanup()
  }
}

async function writeTwoFileFixture(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'alpha.txt'), 'apple banana\n')
  await writeFile(join(root, 'beta.txt'), 'cherry date\n')
}

function parseSourceId(stdout: string): string {
  const match = stdout.match(/source added: (\S+)/)
  expect(match).not.toBeNull()
  const id = match?.[1]
  expect(id).toBeDefined()
  return id as string
}

async function addLocalSource(sandbox: Sandbox, root: string): Promise<string> {
  const result = await sandbox.run([
    'source',
    'add',
    '--adapter',
    'local.directory',
    '--realm',
    'global',
    '--root',
    root,
  ])
  expect(result.stderr).toBe('')
  expect(result.exitCode).toBe(0)
  return parseSourceId(result.stdout)
}

function countRows(db: Database, table: string): number {
  const row = db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
    count: number
  }
  return row.count
}

describe('sync local.directory e2e', () => {
  test('sync exits 0', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      await addLocalSource(sandbox, root)

      const result = await sandbox.run(['sync'])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('sync completed:')
    })
  })

  test('sync events format emits low-token progress lines', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      const sourceId = await addLocalSource(sandbox, root)

      const result = await sandbox.run(['sync', '--format', 'events'])

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`sync_start source=${sourceId}`)
      expect(result.stdout).toContain(`sync_done source=${sourceId}`)
      expect(result.stdout).toContain('items=2')
      expect(result.stdout).toContain('chunks=2')
    })
  })

  test('source add --path limits sync to the configured directory', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      await addLocalSourceWithPath(sandbox, root)

      const sync = await sandbox.run(['sync'])
      expect(sync.exitCode, sync.stderr).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const items = db
          .prepare('SELECT uri FROM items ORDER BY uri')
          .all() as { uri: string }[]
        expect(items).toHaveLength(2)
        expect(items.map((row) => row.uri)).toEqual([
          `file://${join(root, 'alpha.txt')}`,
          `file://${join(root, 'beta.txt')}`,
        ])
        expect(countRows(db, 'item_chunks')).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    })
  })

  test('items inserted', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      await addLocalSource(sandbox, root)
      const sync = await sandbox.run(['sync'])
      expect(sync.exitCode).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        expect(countRows(db, 'items')).toBeGreaterThanOrEqual(2)
        expect(countRows(db, 'item_chunks')).toBeGreaterThanOrEqual(2)
      } finally {
        db.close()
      }
    })
  })

  test('sync_runs row recorded', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      const sourceId = await addLocalSource(sandbox, root)
      const sync = await sandbox.run(['sync'])
      expect(sync.exitCode).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const run = db
          .prepare(
            'SELECT id, status, completed_at, errors_count FROM sync_runs WHERE source_id = ?',
          )
          .get(sourceId) as {
          id: string
          status: string
          completed_at: number | null
          errors_count: number
        } | null
        expect(run).not.toBeNull()
        expect(run?.status).toBe('completed')
        expect(run?.completed_at).not.toBeNull()
        expect(run?.errors_count).toBe(0)
      } finally {
        db.close()
      }
    })
  })

  test('idempotent re-run', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await writeTwoFileFixture(root)
      await addLocalSource(sandbox, root)
      const first = await sandbox.run(['sync'])
      expect(first.exitCode).toBe(0)

      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const firstItems = countRows(db, 'items')
        const firstChunks = countRows(db, 'item_chunks')
        const second = await sandbox.run(['sync'])
        expect(second.exitCode).toBe(0)

        expect(countRows(db, 'items')).toBe(firstItems)
        expect(countRows(db, 'item_chunks')).toBe(firstChunks)
        expect(countRows(db, 'sync_runs')).toBe(2)
      } finally {
        db.close()
      }
    })
  })

  test('deleted local files are tombstoned and hidden from search', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await mkdir(root, { recursive: true })
      const filePath = join(root, 'orchid.txt')
      await writeFile(filePath, 'ctxdogfood unique orchid tombstone token\n')
      await addLocalSource(sandbox, root)

      const first = await sandbox.run(['sync'])
      expect(first.exitCode).toBe(0)
      const found = await sandbox.run(['search', 'ctxdogfood'])
      expect(found.exitCode).toBe(0)
      expect(found.stdout).toContain('orchid.txt')

      await rm(filePath)
      const second = await sandbox.run(['sync'])
      expect(second.exitCode).toBe(0)
      expect(second.stdout).toContain('tombstones=1')

      const hidden = await sandbox.run(['search', 'ctxdogfood'])
      expect(hidden.exitCode).toBe(0)
      expect(hidden.stdout).not.toContain('orchid.txt')

      const included = await sandbox.run([
        'search',
        'ctxdogfood',
        '--include-deleted',
      ])
      expect(included.exitCode).toBe(0)
      expect(included.stdout).toContain('orchid.txt')
    })
  })

  test('missing directory increments errors_count', async () => {
    await withInitializedSandbox(async (sandbox) => {
      const missingRoot = join(sandbox.dir, 'does-not-exist')
      const sourceId = await addLocalSource(sandbox, missingRoot)

      const result = await sandbox.run(['sync'])

      // V1 §1.6: a missing root is a non-fatal warning; the run completes and
      // exits 0 with errors_count > 0.
      expect(result.exitCode).toBe(0)
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const row = db
          .prepare('SELECT errors_count FROM sync_runs WHERE source_id = ?')
          .get(sourceId) as { errors_count: number } | null
        expect(row?.errors_count).toBeGreaterThan(0)
      } finally {
        db.close()
      }
    })
  })

  test('partial results exit 0 (completed with warnings)', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      console.warn('skipping unreadable-file check when running as root')
      return
    }

    await withInitializedSandbox(async (sandbox) => {
      const root = join(sandbox.dir, 'fixture')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'ok.txt'), 'apple banana\n')
      const unreadable = join(root, 'unreadable.txt')
      await writeFile(unreadable, 'this cannot be read\n')
      await chmod(unreadable, 0o000)
      await addLocalSource(sandbox, root)

      try {
        const result = await sandbox.run(['sync'])
        // V1 §1.6: completed-with-warnings exits 0; the skip is in errors_count.
        expect(result.exitCode).toBe(0)

        const db = new Database(dbPath(sandbox), { readonly: true })
        try {
          const run = db
            .prepare(
              'SELECT errors_count FROM sync_runs ORDER BY started_at DESC LIMIT 1',
            )
            .get() as { errors_count: number } | null
          expect(run?.errors_count).toBeGreaterThan(0)
          expect(countRows(db, 'items')).toBeGreaterThanOrEqual(1)
        } finally {
          db.close()
        }
      } finally {
        await chmod(unreadable, 0o600).catch(() => undefined)
      }
    })
  })
})
