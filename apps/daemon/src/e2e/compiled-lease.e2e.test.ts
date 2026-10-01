import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import {
  type FileLeaseMode,
  type FileLeasePurpose,
  type FileLeaseRequest,
  leasePath,
  type RuntimePathInput,
  readMatchingDiscoveryMetadata,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'

// Packaged (bun build --compile) multi-process gates for retained lease
// ownership. The semantics are identical on Darwin (O_SHLOCK/O_EXLOCK) and
// Linux (retained flock(2)), so the suite runs on both; other platforms have
// no backend and skip. scripts/verify/darwin-daemon-gates.sh runs it on a Mac.

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')
const deadlineMs = 15_000
const nativePlatform =
  process.platform === 'darwin' || process.platform === 'linux'

let buildRoot = ''
let cliExecutable = ''
let daemonExecutable = ''
let holderExecutable = ''
const cleanup: string[] = []
const processes: Bun.Subprocess[] = []

async function buildExecutable(entrypoint: string, output: string) {
  const build = Bun.spawn(
    ['bun', 'build', '--compile', entrypoint, '--outfile', output],
    { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ])
  expect(exitCode, `${stdout}\n${stderr}`).toBe(0)
}

beforeAll(async () => {
  if (!nativePlatform) return
  buildRoot = await mkdtemp(join(tmpdir(), 'ctxindex-lease-build-'))
  cliExecutable = join(buildRoot, 'ctxindex')
  daemonExecutable = join(buildRoot, 'ctxindex-daemon')
  holderExecutable = join(buildRoot, 'lease-holder')
  await Promise.all([
    buildExecutable('apps/cli/bin/ctxindex.mjs', cliExecutable),
    buildExecutable('apps/daemon/src/main.ts', daemonExecutable),
    buildExecutable(
      'packages/local-daemon/src/testing/lease-holder.ts',
      holderExecutable,
    ),
  ])
}, 180_000)

afterAll(async () => {
  for (const child of processes) {
    if (child.exitCode === null) child.kill('SIGKILL')
    await child.exited
  }
  for (const path of cleanup) await rm(path, { recursive: true, force: true })
  if (buildRoot) await rm(buildRoot, { recursive: true, force: true })
})

interface Runtime {
  readonly roots: RuntimePathInput
  readonly env: Record<string, string>
}

// Roots are created owner-private explicitly so the lease parent checks do
// not depend on the caller's umask.
async function createRuntime(base?: string): Promise<Runtime> {
  const dir =
    base ?? (await realpath(await mkdtemp(join(tmpdir(), 'ctxindex-lease-'))))
  if (!base) cleanup.push(dir)
  const runtimeRoot = await mkdtemp('/tmp/ctxd-lease-e2e-')
  cleanup.push(runtimeRoot)
  const roots = {
    configRoot: join(dir, 'config'),
    dataRoot: join(dir, 'data'),
    stateRoot: join(dir, 'state'),
    cacheRoot: join(dir, 'cache'),
  }
  for (const path of Object.values(roots))
    await mkdir(path, { recursive: true, mode: 0o700 })
  return {
    roots,
    env: {
      HOME: process.env.HOME ?? '/',
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      NODE_ENV: 'test',
      NO_COLOR: '1',
      CTXINDEX_CONFIG_HOME: roots.configRoot,
      CTXINDEX_DATA_HOME: roots.dataRoot,
      CTXINDEX_STATE_HOME: roots.stateRoot,
      CTXINDEX_CACHE_HOME: roots.cacheRoot,
      CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
    },
  }
}

function spawn(command: readonly string[], env: Record<string, string>) {
  const child = Bun.spawn([...command], {
    cwd: '/',
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  processes.push(child)
  return child
}

interface Holder {
  readonly process: Bun.Subprocess<'pipe', 'pipe', 'pipe'>
  readonly outcome: 'ready' | 'conflict'
}

// Starts a packaged lease holder and waits for its first line: `ready:` while
// it retains the lease, or `conflict` followed by exit 73.
async function startHolder(
  runtime: Runtime,
  request: FileLeaseRequest,
): Promise<Holder> {
  const child = spawn(
    [holderExecutable, request.canonicalTarget, request.purpose, request.mode],
    runtime.env,
  )
  const reader = child.stdout.getReader()
  const first = await reader.read()
  reader.releaseLock()
  const line = first.value ? new TextDecoder().decode(first.value).trim() : ''
  if (line.startsWith('ready:')) return { process: child, outcome: 'ready' }
  if (line === 'conflict') {
    expect(await child.exited).toBe(73)
    return { process: child, outcome: 'conflict' }
  }
  throw new Error(
    `lease holder failed: ${await new Response(child.stderr).text()}`,
  )
}

async function stopHolder(holder: Holder) {
  holder.process.stdin.end()
  expect(await holder.process.exited).toBe(0)
}

async function killProcess(child: Bun.Subprocess) {
  child.kill('SIGKILL')
  await child.exited
}

function request(
  runtime: Runtime,
  purpose: FileLeasePurpose,
  mode: FileLeaseMode,
): FileLeaseRequest {
  const resolved = resolveRuntimeIdentity(runtime.roots)
  return {
    canonicalTarget:
      purpose === 'database' ? resolved.databasePath : resolved.stateRoot,
    purpose,
    mode,
  }
}

async function expectPrivateLeaseFile(path: string) {
  const file = await lstat(path)
  expect(file.isFile()).toBe(true)
  expect(file.uid).toBe(userInfo().uid)
  expect(file.mode & 0o777).toBe(0o600)
  expect(file.nlink).toBe(1)
  const parent = await lstat(dirname(path))
  expect(parent.isDirectory()).toBe(true)
  expect(parent.uid).toBe(userInfo().uid)
  expect(parent.mode & 0o022).toBe(0)
  return file.ino
}

async function waitForReady(runtime: Runtime, daemon: Bun.Subprocess) {
  const resolved = resolveRuntimeIdentity(runtime.roots)
  const deadline = Date.now() + deadlineMs
  while (Date.now() <= deadline) {
    if (daemon.exitCode !== null)
      throw new Error(`daemon exited early with ${daemon.exitCode}`)
    try {
      const metadata = readMatchingDiscoveryMetadata(
        resolved.stateRoot,
        resolved.identity,
      )
      if (metadata?.lifecycle === 'ready') return
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error
    }
    await Bun.sleep(10)
  }
  throw new Error('daemon readiness deadline exceeded')
}

async function runToExit(child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>) {
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

describe.skipIf(!nativePlatform)(
  `compiled retained lease ownership (${process.platform})`,
  () => {
    test('concurrent packaged contenders elect one exclusive owner, SIGKILL releases it, and the file is never unlinked', async () => {
      const runtime = await createRuntime()
      const exclusive = request(runtime, 'database', 'exclusive')
      const path = leasePath(exclusive)

      const contenders = await Promise.all(
        Array.from({ length: 6 }, () => startHolder(runtime, exclusive)),
      )
      const winners = contenders.filter((holder) => holder.outcome === 'ready')
      expect(winners).toHaveLength(1)
      const inode = await expectPrivateLeaseFile(path)

      const [winner] = winners
      if (!winner) throw new Error('missing exclusive winner')
      await killProcess(winner.process)
      const reacquired = await startHolder(runtime, exclusive)
      expect(reacquired.outcome).toBe('ready')
      expect(await expectPrivateLeaseFile(path)).toBe(inode)
      await stopHolder(reacquired)

      const shared = await Promise.all(
        Array.from({ length: 4 }, () =>
          startHolder(runtime, { ...exclusive, mode: 'shared' }),
        ),
      )
      expect(shared.map((holder) => holder.outcome)).toEqual(
        Array(4).fill('ready'),
      )
      expect((await startHolder(runtime, exclusive)).outcome).toBe('conflict')
      for (const holder of shared.slice(0, 3)) await killProcess(holder.process)
      expect((await startHolder(runtime, exclusive)).outcome).toBe('conflict')
      const lastShared = shared[3]
      if (!lastShared) throw new Error('missing shared holder')
      await killProcess(lastShared.process)

      const final = await startHolder(runtime, exclusive)
      expect(final.outcome).toBe('ready')
      await stopHolder(final)
      expect(await expectPrivateLeaseFile(path)).toBe(inode)
    }, 60_000)

    test('a packaged daemon started through an alias owns both leases against holders, the CLI, and a second daemon', async () => {
      const base = await realpath(
        await mkdtemp(join(tmpdir(), 'ctxindex-lease-alias-')),
      )
      cleanup.push(base)
      const physicalRoot = join(base, 'physical')
      const aliasRoot = join(base, 'alias')
      await mkdir(physicalRoot, { mode: 0o700 })
      await symlink(physicalRoot, aliasRoot)
      const physical = await createRuntime(physicalRoot)
      const alias = await createRuntime(aliasRoot)
      expect(resolveRuntimeIdentity(alias.roots).databasePath).toBe(
        resolveRuntimeIdentity(physical.roots).databasePath,
      )

      // Discovery endpoints are shared through the alias runtime root.
      const physicalEnv = {
        ...physical.env,
        CTXINDEX_DAEMON_RUNTIME_ROOT: alias.env.CTXINDEX_DAEMON_RUNTIME_ROOT,
      } as Record<string, string>
      const daemon = spawn([daemonExecutable], alias.env)
      await waitForReady(physical, daemon)

      const database = request(physical, 'database', 'exclusive')
      const lifecycle = request(physical, 'lifecycle', 'exclusive')
      const databaseInode = await expectPrivateLeaseFile(leasePath(database))
      const lifecycleInode = await expectPrivateLeaseFile(leasePath(lifecycle))

      for (const contended of [
        database,
        { ...database, mode: 'shared' } as const,
        lifecycle,
      ]) {
        expect((await startHolder(physical, contended)).outcome).toBe(
          'conflict',
        )
      }

      const directOpener = await runToExit(
        spawn([cliExecutable, 'init'], physicalEnv),
      )
      expect(directOpener.exitCode, directOpener.stderr).toBe(50)
      expect(directOpener.stdout).toBe('')

      const secondDaemon = await runToExit(
        spawn([daemonExecutable], physicalEnv),
      )
      expect(secondDaemon.exitCode).not.toBe(0)
      expect(secondDaemon.stderr).toMatch(/lease|owner|held|conflict/i)

      await killProcess(daemon)
      for (const released of [database, lifecycle]) {
        const holder = await startHolder(physical, released)
        expect(holder.outcome).toBe('ready')
        await stopHolder(holder)
      }
      expect(await expectPrivateLeaseFile(leasePath(database))).toBe(
        databaseInode,
      )
      expect(await expectPrivateLeaseFile(leasePath(lifecycle))).toBe(
        lifecycleInode,
      )
    }, 60_000)

    test.each([
      'mode',
      'symlink',
    ] as const)('a packaged daemon fails closed on an unsafe %s lease file before creating SQLite', async (unsafe) => {
      const runtime = await createRuntime()
      const database = request(runtime, 'database', 'exclusive')
      const path = leasePath(database)
      const makeUnsafe = async () => {
        if (unsafe === 'mode') {
          await writeFile(path, '')
          await chmod(path, 0o644)
        } else {
          await symlink(join(runtime.roots.dataRoot, 'elsewhere'), path)
        }
      }
      await makeUnsafe()

      const result = await runToExit(spawn([daemonExecutable], runtime.env))
      expect(result.exitCode).toBe(50)
      expect(result.stderr.trim()).toMatch(
        /^The local daemon refused an unsafe retained lease: Lease file must (use private mode 0600|not be a symlink)$/,
      )

      expect(await Bun.file(database.canonicalTarget).exists()).toBe(false)
      const remaining = await lstat(path)
      expect(
        unsafe === 'mode' ? remaining.isFile() : remaining.isSymbolicLink(),
      ).toBe(true)

      // After initialization, the packaged CLI's explicit start reports the
      // bounded lifecycle failure and the private startup log names the reason.
      await rm(path)
      const initialized = await runToExit(
        spawn([cliExecutable, 'init'], runtime.env),
      )
      expect(initialized.exitCode, initialized.stderr).toBe(0)
      await rm(path)
      await makeUnsafe()
      const started = await runToExit(
        spawn([cliExecutable, 'daemon', 'start'], runtime.env),
      )
      expect(started.exitCode).toBe(50)
      expect(started.stderr).toContain('startup log')
      expect(started.stderr).not.toContain(runtime.roots.dataRoot)
      const log = await Bun.file(
        join(runtime.roots.stateRoot, 'daemon', 'startup.log'),
      ).text()
      expect(log).toContain('The local daemon refused an unsafe retained lease')
      // The CLI waits out its fixed readiness deadline before reporting.
    }, 60_000)
  },
)
