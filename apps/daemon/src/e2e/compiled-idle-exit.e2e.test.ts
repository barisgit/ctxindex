import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Packaged journey for the internal test-only idle control: the CLI forwards
// CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS to the detached daemon, which exits on its
// own after the shortened idle interval even while status is polled, releases
// ownership, and can be started again.

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')
const IDLE_TIMEOUT_MS = 1_500

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

let buildRoot = ''
let cliExecutable = ''

async function run(
  command: readonly string[],
  env?: Record<string, string>,
): Promise<CommandResult> {
  const child = Bun.spawn([...command], {
    cwd: env === undefined ? repoRoot : '/',
    ...(env === undefined ? {} : { env }),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stdout, stderr }
}

async function buildExecutable(entrypoint: string, output: string) {
  const build = await run([
    'bun',
    'build',
    '--compile',
    entrypoint,
    '--outfile',
    output,
  ])
  expect(build.exitCode, `${build.stdout}\n${build.stderr}`).toBe(0)
  await chmod(output, 0o755)
}

beforeAll(async () => {
  buildRoot = await mkdtemp(join(tmpdir(), 'ctxindex-idle-build-'))
  cliExecutable = join(buildRoot, 'ctxindex')
  // The CLI launches the sibling packaged daemon executable.
  await Promise.all([
    buildExecutable('apps/cli/bin/ctxindex.mjs', cliExecutable),
    buildExecutable(
      'apps/daemon/src/main.ts',
      join(buildRoot, 'ctxindex-daemon'),
    ),
  ])
})

afterAll(async () => {
  if (buildRoot) await rm(buildRoot, { recursive: true, force: true })
})

async function daemonStatus(env: Record<string, string>) {
  const result = await run(
    [cliExecutable, 'daemon', 'status', '--format', 'json'],
    env,
  )
  expect(result.exitCode, result.stderr).toBe(0)
  return JSON.parse(result.stdout) as {
    readonly status: string
    readonly health?: { readonly instanceId: string }
  }
}

async function daemonStart(env: Record<string, string>) {
  const result = await run(
    [cliExecutable, 'daemon', 'start', '--format', 'json'],
    env,
  )
  expect(result.exitCode, result.stderr).toBe(0)
  const status = await daemonStatus(env)
  expect(status.status).toBe('running')
  return status.health?.instanceId as string
}

describe.skipIf(process.platform !== 'linux' && process.platform !== 'darwin')(
  'compiled daemon automatic idle exit',
  () => {
    test('the test-only short idle timeout exits a packaged daemon despite status polling, then it restarts', async () => {
      const dir = await realpath(
        await mkdtemp(join(tmpdir(), 'ctxindex-idle-')),
      )
      const runtimeRoot = await mkdtemp('/tmp/ctxd-idle-e2e-')
      const env = {
        HOME: process.env.HOME ?? '/',
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        NODE_ENV: 'test',
        NO_COLOR: '1',
        CTXINDEX_CONFIG_HOME: join(dir, 'config'),
        CTXINDEX_DATA_HOME: join(dir, 'data'),
        CTXINDEX_STATE_HOME: join(dir, 'state'),
        CTXINDEX_CACHE_HOME: join(dir, 'cache'),
        CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
        CTXINDEX_KEYTAR_MOCK_FILE: join(dir, 'keytar.json'),
        CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS: String(IDLE_TIMEOUT_MS),
      }
      try {
        expect((await run([cliExecutable, 'init'], env)).exitCode).toBe(0)

        const startedAt = Date.now()
        const first = await daemonStart(env)

        // Status probes arrive far more often than the idle interval; they must
        // not count as activity, so the daemon still exits on its own.
        let status = await daemonStatus(env)
        while (status.status === 'running' && Date.now() - startedAt < 30_000) {
          await Bun.sleep(200)
          status = await daemonStatus(env)
        }
        expect(status).toEqual({ status: 'stopped' })
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(IDLE_TIMEOUT_MS)

        // Ownership was released, so a fresh instance can take over.
        const second = await daemonStart(env)
        expect(second).not.toBe(first)
      } finally {
        await run([cliExecutable, 'daemon', 'stop', '--format', 'json'], env)
        await rm(dir, { recursive: true, force: true })
        await rm(runtimeRoot, { recursive: true, force: true })
      }
    }, 60_000)
  },
)
