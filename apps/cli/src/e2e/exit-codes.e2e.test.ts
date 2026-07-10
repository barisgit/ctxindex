import { Database } from 'bun:sqlite'
import { afterAll, describe, expect, test } from 'bun:test'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'
import { type MockGmailServer, startMockGmail } from './_mock-gmail'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const withTimeoutScript = join(repoRoot, 'scripts/with-timeout.ts')

const coverageMatrix = [
  ['0', 'ctxindex init in a fresh sandbox'],
  ['2', 'realm add rejects an invalid slug'],
  ['10', 'Gmail invalid_grant marks the source needs_auth'],
  [
    '0',
    'local.directory partial sync (completed with warnings) keeps valid files and reports unreadable-file errors',
  ],
  ['30', 'malformed SQLite database exits as data_integrity'],
  ['40', 'malformed TOML config exits as config_error'],
  ['50', 'loopback OAuth timeout'],
  ['124', 'scripts/with-timeout wall timeout'],
  ['130', 'SIGINT during sync'],
] as const

interface RunningCli {
  readonly proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  result(timeoutMs?: number): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }>
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

async function initSandbox(sandbox: Sandbox): Promise<void> {
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  expect(init.stderr).toBe('')
}

async function writeLocalFixture(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'alpha.txt'), 'alpha exit-code needle\n')
}

async function addLocalSource(sandbox: Sandbox, root: string): Promise<string> {
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
  expect(added.stderr).toBe('')
  return parseSourceId(added.stdout)
}

async function setupLocalSource(): Promise<{
  readonly sandbox: Sandbox
  readonly sourceId: string
  readonly root: string
}> {
  const sandbox = await createSandbox()
  await initSandbox(sandbox)
  const root = join(sandbox.dir, 'fixture')
  await writeLocalFixture(root)
  const sourceId = await addLocalSource(sandbox, root)
  return { sandbox, sourceId, root }
}

async function authAdd(
  sandbox: Sandbox,
  mock: MockGmailServer,
  code: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return sandbox.run(
    [
      'auth',
      'add',
      'google',
      '--client-id',
      'mock-client-id',
      '--client-secret',
      'mock-client-secret',
      '--auth-code',
      code,
    ],
    { env: mock.env(sandbox) },
  )
}

async function setupGoogleSource(): Promise<{
  readonly sandbox: Sandbox
  readonly mock: MockGmailServer
  readonly sourceId: string
}> {
  const sandbox = await createSandbox()
  const mock = startMockGmail()
  await initSandbox(sandbox)
  const added = await sandbox.run([
    'source',
    'add',
    '--adapter',
    'google.mailbox',
    '--realm',
    'global',
  ])
  expect(added.exitCode, added.stderr).toBe(0)
  const auth = await authAdd(sandbox, mock, 'initial-code')
  expect(auth.exitCode, auth.stderr).toBe(0)
  return { sandbox, mock, sourceId: parseSourceId(added.stdout) }
}

function lastStatus(sandbox: Sandbox, sourceId: string): string | null {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare('SELECT last_status FROM source_sync_state WHERE source_id = ?')
      .get(sourceId) as { last_status: string } | null
    return row?.last_status ?? null
  } finally {
    db.close()
  }
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
    async result(timeoutMs = 8000) {
      const exitCode = await withTimeout(
        proc.exited,
        timeoutMs,
        `timed out waiting for ctxindex ${args.join(' ')}`,
        () => proc.kill('SIGKILL'),
      )
      const [stdoutText, stderrText] = await Promise.all([stdout, stderr])
      return { exitCode, stdout: stdoutText, stderr: stderrText }
    },
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(new Error(message))
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function waitForLock(sandbox: Sandbox, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const db = new Database(dbPath(sandbox), { readonly: true })
      try {
        const row = db
          .prepare(
            `SELECT run_id FROM sync_locks
             WHERE scope = 'global' AND released_at IS NULL`,
          )
          .get() as { run_id: string } | null
        if (row) return
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

async function runWithTimeoutWrapper(
  seconds: string,
  command: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(
    ['bun', withTimeoutScript, seconds, '--', ...command],
    {
      cwd: repoRoot,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

afterAll(() => {
  console.log(
    `exit-code coverage:\n${coverageMatrix
      .map(([code, scenario]) => `${code}\t${scenario}`)
      .join('\n')}`,
  )
})

// Platform conditional: root can still read chmod 000 files, so this
// permission-denied scenario is not meaningful under uid 0.
const unreadableFileTest =
  typeof process.getuid === 'function' && process.getuid() === 0
    ? test.skip
    : test

describe('exit codes e2e', () => {
  test('exit 0 ok: init succeeds in a fresh sandbox', async () => {
    const sandbox = await createSandbox()
    try {
      const result = await sandbox.run(['init'])

      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('ctxindex initialized')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('exit 2 usage: invalid realm slug is rejected', async () => {
    const sandbox = await createSandbox()
    try {
      await initSandbox(sandbox)

      const result = await sandbox.run(['realm', 'add', 'bad name!'])

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('invalid realm slug')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('exit 10 needs_auth: Gmail invalid_grant marks source needs_auth', async () => {
    const { sandbox, mock, sourceId } = await setupGoogleSource()
    try {
      mock.setRefreshMode('invalid_grant')

      const result = await sandbox.run(['sync', '--source', sourceId], {
        env: mock.env(sandbox),
      })

      expect(result.exitCode, result.stderr).toBe(10)
      expect(result.stderr).toContain('google authorization expired')
      expect(lastStatus(sandbox, sourceId)).toBe('needs_auth')
    } finally {
      mock.stop()
      await sandbox.cleanup()
    }
  })

  unreadableFileTest(
    'exit 0 partial: unreadable local file records errors but the run completes',
    async () => {
      const { sandbox, root } = await setupLocalSource()
      const unreadable = join(root, 'unreadable.txt')
      try {
        await writeFile(unreadable, 'this cannot be read\n')
        await chmod(unreadable, 0o000)

        const result = await sandbox.run(['sync'])

        // V1 §1.6: a completed run exits 0 regardless of errors_count; the
        // non-fatal skip is surfaced via errors_count, not the exit code.
        expect(result.exitCode, result.stderr).toBe(0)
        const db = new Database(dbPath(sandbox), { readonly: true })
        try {
          const run = db
            .prepare(
              'SELECT errors_count FROM sync_runs ORDER BY started_at DESC LIMIT 1',
            )
            .get() as { errors_count: number } | null
          const items = db
            .prepare('SELECT COUNT(*) AS count FROM items')
            .get() as {
            count: number
          }
          expect(run?.errors_count).toBeGreaterThan(0)
          expect(items.count).toBeGreaterThanOrEqual(1)
        } finally {
          db.close()
        }
      } finally {
        await chmod(unreadable, 0o600).catch(() => undefined)
        await sandbox.cleanup()
      }
    },
  )

  test('exit 30 data_integrity: malformed SQLite database is rejected before init', async () => {
    const sandbox = await createSandbox()
    try {
      await mkdir(sandbox.env.CTXINDEX_DATA_HOME, { recursive: true })
      await writeFile(dbPath(sandbox), 'not a sqlite database')

      const result = await sandbox.run(['init'])

      expect(result.exitCode).toBe(30)
      expect(result.stderr).toContain('file is not a database')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('exit 40 config_error: malformed TOML config is rejected', async () => {
    const sandbox = await createSandbox()
    try {
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
        '[secrets\nbackend = "file"\n',
      )

      const result = await sandbox.run(['secrets', 'migrate', 'file'])

      expect(result.exitCode).toBe(40)
      expect(result.stderr).toContain('failed to parse config.toml')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('exit 50 loopback timeout: OAuth callback does not arrive', async () => {
    const sandbox = await createSandbox()
    try {
      await initSandbox(sandbox)

      const result = await sandbox.run(
        [
          'auth',
          'add',
          'google',
          '--client-id',
          'client-id',
          '--client-secret',
          'client-secret',
          '--loopback',
        ],
        {
          env: {
            CTXINDEX_NO_BROWSER: '1',
            CTXINDEX_LOOPBACK_TIMEOUT_SECS: '0.5',
          },
        },
      )

      expect(result.exitCode).toBe(50)
      expect(result.stderr).toContain('loopback_timeout')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('exit 124 wall timeout: with-timeout stops a long sleep', async () => {
    const result = await runWithTimeoutWrapper('0.3', ['sleep', '60'])

    expect(result.exitCode, result.stderr).toBe(124)
  })

  test('exit 130 sigint: sync exits as cancelled when interrupted', async () => {
    const { sandbox, sourceId } = await setupLocalSource()
    try {
      const running = spawnCli(sandbox, ['sync', '--source', sourceId], {
        NODE_ENV: 'test',
        CTXINDEX_TEST_SYNC_DELAY_MS: '3000',
      })
      await waitForLock(sandbox)

      running.proc.kill('SIGINT')
      const result = await running.result()

      expect(result.exitCode, result.stderr).toBe(130)
    } finally {
      await sandbox.cleanup()
    }
  })
})
