import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acquireFileLease,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'

// The runtime removes discovery metadata before releasing its leases. An
// ensure that observes no metadata while an owner still retains lifecycle
// ownership must wait for release instead of launching a replacement that
// loses acquisition and exits.

const repoRoot = new URL('../../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

let root: string | undefined
let env: Record<string, string> = {}

async function runCli(args: string[]) {
  const proc = Bun.spawn([process.execPath, cliBin, ...args], {
    cwd: repoRoot,
    env,
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
  if (!root) return
  await runCli(['daemon', 'stop', '--format', 'json'])
  await rm(root, { recursive: true, force: true })
  root = undefined
})

describe.skipIf(process.platform === 'win32')(
  'daemon ensure with retained lifecycle ownership',
  () => {
    test('start waits for a metadata-less retained owner, then converges', async () => {
      root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-retained-owner-'))
      env = {
        HOME: root,
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        NODE_ENV: 'test',
        NO_COLOR: '1',
        CTXINDEX_CONFIG_HOME: join(root, 'config'),
        CTXINDEX_DATA_HOME: join(root, 'data'),
        CTXINDEX_STATE_HOME: join(root, 'state'),
        CTXINDEX_CACHE_HOME: join(root, 'cache'),
      }
      const init = await runCli(['init'])
      expect(init.exitCode, init.stderr).toBe(0)

      const runtime = resolveRuntimeIdentity({
        configRoot: env.CTXINDEX_CONFIG_HOME as string,
        dataRoot: env.CTXINDEX_DATA_HOME as string,
        stateRoot: env.CTXINDEX_STATE_HOME as string,
        cacheRoot: env.CTXINDEX_CACHE_HOME as string,
      })
      // Stands in for an old owner between metadata removal and lease release.
      const owner = acquireFileLease({
        canonicalTarget: runtime.stateRoot,
        purpose: 'lifecycle',
        mode: 'exclusive',
      })
      const start = runCli(['daemon', 'start', '--format', 'json'])
      await Bun.sleep(1_000)
      owner.release()

      const started = await start
      expect(started.exitCode, started.stderr).toBe(0)
      expect(JSON.parse(started.stdout)).toMatchObject({
        status: 'running',
        started: true,
      })
      const status = await runCli(['daemon', 'status', '--format', 'json'])
      expect(status.exitCode, status.stderr).toBe(0)
      expect(JSON.parse(status.stdout)).toMatchObject({ status: 'running' })
    }, 30_000)
  },
)
