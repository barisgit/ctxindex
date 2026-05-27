import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyPragmas } from '@ctxindex/core/storage'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

interface RunningCli {
  readonly proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  result(): Promise<{ exitCode: number; stdout: string; stderr: string }>
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function openDb(sandbox: Sandbox): Database {
  const db = new Database(dbPath(sandbox))
  applyPragmas(db)
  return db
}

function spawnCli(
  sandbox: Sandbox,
  args: string[],
  env: Record<string, string | undefined> = {},
): RunningCli {
  const proc = Bun.spawn(['bun', cliBin, ...args], {
    cwd: repoRoot,
    env: { ...sandbox.env, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = new Response(proc.stdout).text()
  const stderr = new Response(proc.stderr).text()
  return {
    proc,
    async result() {
      const [exitCode, stdoutText, stderrText] = await Promise.all([
        proc.exited,
        stdout,
        stderr,
      ])
      return { exitCode, stdout: stdoutText, stderr: stderrText }
    },
  }
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function writeFixture(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'alpha.txt'), 'alpha crash recovery needle\n')
  await writeFile(join(root, 'beta.txt'), 'beta crash recovery needle\n')
}

async function setupLocalSource(): Promise<{
  sandbox: Sandbox
  sourceId: string
}> {
  const sandbox = await createSandbox()
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  const root = join(sandbox.dir, 'fixture')
  await writeFixture(root)
  const added = await sandbox.run([
    'source',
    'add',
    '--adapter',
    'local.directory',
    '--realm',
    'global',
    '--root',
    root,
  ])
  expect(added.exitCode, added.stderr).toBe(0)
  return { sandbox, sourceId: parseSourceId(added.stdout) }
}

async function waitForLock(
  sandbox: Sandbox,
  timeoutMs = 3000,
): Promise<{ runId: string; pid: number | null }> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const db = openDb(sandbox)
      try {
        const row = db
          .prepare(
            `SELECT run_id AS runId, pid FROM sync_locks
             WHERE scope = 'global' AND released_at IS NULL`,
          )
          .get() as { runId: string; pid: number | null } | null
        if (row) return row
      } finally {
        db.close()
      }
    } catch (err) {
      lastError = err
    }
    await Bun.sleep(25)
  }
  throw new Error(
    `timed out waiting for sync lock${lastError ? `: ${String(lastError)}` : ''}`,
  )
}

async function killAfterLock(
  sandbox: Sandbox,
  sourceId: string,
): Promise<{ runId: string }> {
  const running = spawnCli(sandbox, ['sync', '--source', sourceId], {
    NODE_ENV: 'test',
    CTXINDEX_TEST_SYNC_DELAY_MS: '2000',
  })
  const lock = await waitForLock(sandbox)
  running.proc.kill('SIGKILL')
  await running.result().catch(() => undefined)
  return { runId: lock.runId }
}

function syncRun(
  sandbox: Sandbox,
  runId: string,
): { status: string; released_at: number | null } | null {
  const db = openDb(sandbox)
  try {
    return db
      .prepare('SELECT status, released_at FROM sync_runs WHERE id = ?')
      .get(runId) as { status: string; released_at: number | null } | null
  } finally {
    db.close()
  }
}

function cursorCompletedAt(sandbox: Sandbox, sourceId: string): number {
  const db = openDb(sandbox)
  try {
    const row = db
      .prepare('SELECT cursor_json FROM source_sync_state WHERE source_id = ?')
      .get(sourceId) as { cursor_json: string | null } | null
    if (!row?.cursor_json) return 0
    const parsed = JSON.parse(row.cursor_json) as { completedAt?: number }
    return parsed.completedAt ?? 0
  } finally {
    db.close()
  }
}

describe('crash recovery e2e', () => {
  test('second sync completes', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      await killAfterLock(sandbox, sourceId)

      const recovered = await sandbox.run(['sync', '--source', sourceId])

      expect(recovered.exitCode, recovered.stderr).toBe(0)
      expect(recovered.stdout).toContain('sync completed:')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('stale lock released_at set', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      const { runId } = await killAfterLock(sandbox, sourceId)
      const recovered = await sandbox.run(['sync', '--source', sourceId])
      expect(recovered.exitCode, recovered.stderr).toBe(0)

      const crashedRun = syncRun(sandbox, runId)
      expect(crashedRun?.status).toBe('failed')
      expect(typeof crashedRun?.released_at).toBe('number')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('lock acquired before kill', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      const running = spawnCli(sandbox, ['sync', '--source', sourceId], {
        NODE_ENV: 'test',
        CTXINDEX_TEST_SYNC_DELAY_MS: '2000',
      })
      const lock = await waitForLock(sandbox)
      expect(lock.runId).toBeTruthy()
      expect(typeof lock.pid).toBe('number')
      running.proc.kill('SIGKILL')
      await running.result().catch(() => undefined)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('cursor monotonic after recovery', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      const first = await sandbox.run(['sync', '--source', sourceId])
      expect(first.exitCode, first.stderr).toBe(0)
      const before = cursorCompletedAt(sandbox, sourceId)

      await killAfterLock(sandbox, sourceId)
      const recovered = await sandbox.run(['sync', '--source', sourceId])
      expect(recovered.exitCode, recovered.stderr).toBe(0)

      const after = cursorCompletedAt(sandbox, sourceId)
      expect(after).toBeGreaterThanOrEqual(before)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('dead pid lock recovered', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      const db = openDb(sandbox)
      try {
        const source = db
          .prepare('SELECT realm_id FROM sources WHERE id = ?')
          .get(sourceId) as { realm_id: string }
        db.prepare(
          `INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at)
           VALUES ('dead-pid-run', ?, ?, 'sync', 'running', ?)`,
        ).run(sourceId, source.realm_id, Date.now() - 60_000)
        db.prepare(
          `INSERT INTO sync_locks (scope, run_id, pid, acquired_at, released_at)
           VALUES ('global', 'dead-pid-run', 99999999, ?, NULL)`,
        ).run(Date.now() - 60_000)
      } finally {
        db.close()
      }

      const result = await sandbox.run(['sync', '--source', sourceId])
      expect(result.exitCode, result.stderr).toBe(0)
      expect(typeof syncRun(sandbox, 'dead-pid-run')?.released_at).toBe(
        'number',
      )
    } finally {
      await sandbox.cleanup()
    }
  })
})
