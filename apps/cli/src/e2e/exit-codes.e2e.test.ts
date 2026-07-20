import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const withTimeoutScript = join(repoRoot, 'scripts/with-timeout.ts')

const coverageMatrix = [
  ['0', 'ctxindex init in a fresh sandbox'],
  ['2', 'realm add rejects an invalid slug'],
  ['30', 'malformed SQLite database exits as data_integrity'],
  ['40', 'malformed TOML config exits as config_error'],
  ['50', 'loopback OAuth timeout'],
  ['124', 'scripts/with-timeout wall timeout'],
] as const

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

async function initSandbox(sandbox: Sandbox): Promise<void> {
  const init = await sandbox.run(['init'])
  expect(init.exitCode, init.stderr).toBe(0)
  expect(init.stderr).toBe('')
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

      const result = await sandbox.run(['secrets', 'status', '--json'])

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

      const app = await sandbox.run(
        ['oauth-app', 'add', 'google', 'google', '--from-env'],
        { env: { CTXINDEX_GOOGLE_CLIENT_ID: 'client-id' } },
      )
      expect(app.exitCode, app.stderr).toBe(0)

      const result = await sandbox.run(
        ['account', 'add', 'google', '--app', 'google'],
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
})
