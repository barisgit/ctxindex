import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Separate source-mode CLI processes converge on one daemon owner for one
// canonical runtime. Cross-process convergence relies on the daemon's retained
// ownership lease, not on any in-process sharing.

const repoRoot = new URL('../../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

type Runtime = { root: string; env: Record<string, string> }

const runtimes: Runtime[] = []

async function createRuntime(): Promise<Runtime> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-converge-'))
  const runtime = {
    root,
    env: {
      HOME: root,
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      NODE_ENV: 'test',
      NO_COLOR: '1',
      CTXINDEX_CONFIG_HOME: join(root, 'config'),
      CTXINDEX_DATA_HOME: join(root, 'data'),
      CTXINDEX_STATE_HOME: join(root, 'state'),
      CTXINDEX_CACHE_HOME: join(root, 'cache'),
    },
  }
  runtimes.push(runtime)
  return runtime
}

async function runCli(runtime: Runtime, args: string[]) {
  const proc = Bun.spawn([process.execPath, cliBin, ...args], {
    cwd: repoRoot,
    env: runtime.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    await runCli(runtime, ['daemon', 'stop', '--format', 'json'])
    await rm(runtime.root, { recursive: true, force: true })
  }
})

describe.skipIf(process.platform === 'win32')(
  'daemon ensure across CLI processes',
  () => {
    test('concurrent first commands and explicit starts converge on one owner', async () => {
      const runtime = await createRuntime()
      const init = await runCli(runtime, ['init'])
      expect(init.exitCode, init.stderr).toBe(0)

      const [lists, starts] = await Promise.all([
        Promise.all(
          Array.from({ length: 3 }, () =>
            runCli(runtime, ['realm', 'list', '--format', 'json']),
          ),
        ),
        Promise.all(
          Array.from({ length: 2 }, () =>
            runCli(runtime, ['daemon', 'start', '--format', 'json']),
          ),
        ),
      ])

      for (const result of lists) {
        expect(result.exitCode, result.stderr).toBe(0)
        expect(JSON.parse(result.stdout)).toEqual([])
      }
      const instances = new Set<string>()
      for (const result of starts) {
        expect(result.exitCode, result.stderr).toBe(0)
        const started = JSON.parse(result.stdout)
        expect(started.status).toBe('running')
        instances.add(started.health.instanceId)
      }
      expect(instances.size).toBe(1)

      const status = await runCli(runtime, [
        'daemon',
        'status',
        '--format',
        'json',
      ])
      expect(status.exitCode, status.stderr).toBe(0)
      expect(JSON.parse(status.stdout)).toMatchObject({
        status: 'running',
        health: { instanceId: [...instances][0], ready: true },
      })
    }, 60_000)
  },
)
