import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, writeConfig } from '@ctxindex/core/config'
import {
  discoveryMetadataPath,
  leasePath,
  type RuntimePathInput,
  readMatchingDiscoveryMetadata,
  resolveEndpoint,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')
const deadlineMs = 15_000

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

interface TestRuntime {
  readonly dir: string
  readonly roots: RuntimePathInput
  readonly runtimeRoot: string
  readonly env: Record<string, string>
}

interface RunningProcess {
  readonly process: ReturnType<typeof Bun.spawn>
  readonly stdout: Promise<string>
  readonly stderr: Promise<string>
}

let buildRoot = ''
let cliExecutable = ''
let daemonExecutable = ''
let leaseHolderExecutable = ''

function cleanEnvironment(extra: Record<string, string> = {}) {
  return {
    HOME: process.env.HOME ?? '/',
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    NODE_ENV: 'test',
    NO_COLOR: '1',
    ...extra,
  }
}

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
  await chmod(output, 0o755)
}

beforeAll(async () => {
  buildRoot = await mkdtemp(join(tmpdir(), 'ctxindex-daemon-build-'))
  cliExecutable = join(buildRoot, 'ctxindex')
  daemonExecutable = join(buildRoot, 'ctxindex-daemon')
  leaseHolderExecutable = join(buildRoot, 'lease-holder')
  await Promise.all([
    buildExecutable('apps/cli/bin/ctxindex.mjs', cliExecutable),
    buildExecutable('apps/daemon/src/main.ts', daemonExecutable),
    buildExecutable(
      'packages/local-daemon/src/testing/lease-holder.ts',
      leaseHolderExecutable,
    ),
  ])
})

afterAll(async () => {
  if (buildRoot) await rm(buildRoot, { recursive: true, force: true })
})

async function createRuntime(prefix: string): Promise<TestRuntime> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  const roots = {
    configRoot: join(dir, 'config'),
    dataRoot: join(dir, 'data'),
    stateRoot: join(dir, 'state'),
    cacheRoot: join(dir, 'cache'),
  }
  const runtimeRoot = await mkdtemp('/tmp/ctxd-e2e-')
  await Promise.all(
    Object.values(roots).map((path) => mkdir(path, { recursive: true })),
  )
  return {
    dir,
    roots,
    runtimeRoot,
    env: cleanEnvironment({
      CTXINDEX_CONFIG_HOME: roots.configRoot,
      CTXINDEX_DATA_HOME: roots.dataRoot,
      CTXINDEX_STATE_HOME: roots.stateRoot,
      CTXINDEX_CACHE_HOME: roots.cacheRoot,
      CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
    }),
  }
}

async function cleanupRuntime(runtime: TestRuntime) {
  await rm(runtime.dir, { recursive: true, force: true })
  await rm(runtime.runtimeRoot, { recursive: true, force: true })
}

function spawnProcess(
  command: readonly string[],
  env: Record<string, string>,
  options: { readonly stdin?: 'pipe' | 'ignore' } = {},
): RunningProcess {
  const child = Bun.spawn([...command], {
    cwd: '/',
    env,
    stdin: options.stdin ?? 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    process: child,
    stdout: new Response(child.stdout).text(),
    stderr: new Response(child.stderr).text(),
  }
}

async function commandResult(child: RunningProcess): Promise<CommandResult> {
  const [exitCode, stdout, stderr] = await Promise.all([
    child.process.exited,
    child.stdout,
    child.stderr,
  ])
  return { exitCode, stdout, stderr }
}

async function runCli(
  runtime: TestRuntime,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): Promise<CommandResult> {
  return commandResult(
    spawnProcess([cliExecutable, ...args], { ...runtime.env, ...extraEnv }),
  )
}

function startDaemon(
  runtime: TestRuntime,
  extraEnv: Record<string, string> = {},
): RunningProcess {
  return spawnProcess([daemonExecutable], {
    ...runtime.env,
    ...extraEnv,
  })
}

async function startLeaseHolder(
  runtime: TestRuntime,
  databasePath: string,
): Promise<RunningProcess> {
  const child = Bun.spawn(
    [leaseHolderExecutable, databasePath, 'database', 'shared'],
    {
      cwd: '/',
      env: runtime.env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const reader = child.stdout.getReader()
  const ready = await Promise.race([
    reader.read(),
    child.exited.then(() => null),
  ])
  reader.releaseLock()
  if (
    !ready?.value ||
    !new TextDecoder().decode(ready.value).startsWith('ready:')
  ) {
    throw new Error('compiled shared lease holder did not become ready')
  }
  return {
    process: child,
    stdout: Promise.resolve(''),
    stderr: new Response(child.stderr).text(),
  }
}

async function pollUntil<T>(
  description: string,
  probe: () =>
    | T
    | null
    | undefined
    | false
    | Promise<T | null | undefined | false>,
  process?: ReturnType<typeof Bun.spawn>,
  timeoutMs = deadlineMs,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const value = await probe()
    if (value) return value
    if (process && process.exitCode !== null) {
      throw new Error(
        `${description}: process exited early with ${process.exitCode}`,
      )
    }
    await Bun.sleep(10)
  }
  throw new Error(`${description}: deadline exceeded`)
}

async function waitForReady(runtime: TestRuntime, child: RunningProcess) {
  const resolved = resolveRuntimeIdentity(runtime.roots)
  try {
    return await pollUntil(
      'daemon readiness',
      () => {
        try {
          const metadata = readMatchingDiscoveryMetadata(
            resolved.stateRoot,
            resolved.identity,
          )
          return metadata?.lifecycle === 'ready' ? metadata : null
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          ) {
            return null
          }
          throw error
        }
      },
      child.process,
    )
  } catch (error) {
    if (child.process.exitCode === null) throw error
    const stderr = await child.stderr
    throw new Error(`${String(error)}\ndaemon stderr:\n${stderr}`)
  }
}

async function waitForExit(
  child: RunningProcess,
  description: string,
  timeoutMs = deadlineMs,
): Promise<CommandResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${description}: deadline exceeded`)),
      timeoutMs,
    )
  })
  try {
    await Promise.race([child.process.exited, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  return commandResult(child)
}

async function stopDaemon(
  child: RunningProcess,
  signal: 'SIGTERM' | 'SIGKILL',
) {
  if (child.process.exitCode === null) child.process.kill(signal)
  return waitForExit(child, `daemon ${signal} exit`)
}

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id: ${stdout}`)
  return match[1]
}

async function initializeLocalSource(runtime: TestRuntime, fileCount = 1) {
  const files = join(runtime.dir, 'files')
  await mkdir(files, { recursive: true })
  for (let offset = 0; offset < fileCount; offset += 256) {
    await Promise.all(
      Array.from(
        { length: Math.min(256, fileCount - offset) },
        (_, relativeIndex) => {
          const index = offset + relativeIndex
          return writeFile(
            join(files, `${String(index).padStart(6, '0')}.txt`),
            `local daemon proof ${index}\n`,
          )
        },
      ),
    )
  }
  expect((await runCli(runtime, ['init'])).exitCode).toBe(0)
  expect((await runCli(runtime, ['realm', 'add', 'work'])).exitCode).toBe(0)
  const added = await runCli(runtime, [
    'source',
    'add',
    'local.directory',
    '--realm',
    'work',
    '--label',
    'files',
    '--config-root-path',
    files,
  ])
  expect(added.exitCode, added.stderr).toBe(0)
  const stopped = await runCli(runtime, ['daemon', 'stop', '--format', 'json'])
  expect(stopped.exitCode, stopped.stderr).toBe(0)
  return { files, sourceId: parseSourceId(added.stdout) }
}

async function initializeBlockingSource(runtime: TestRuntime) {
  expect((await runCli(runtime, ['init'])).exitCode).toBe(0)
  const extension = join(runtime.dir, 'blocking-extension')
  const gate = join(runtime.dir, 'release-blocking-sync')
  await mkdir(extension, { recursive: true })
  await writeFile(
    join(extension, 'package.json'),
    JSON.stringify({
      name: '@ctxindex/blocking-extension-fixture',
      private: true,
      type: 'module',
      ctxindex: { extensions: ['./entry.ts'] },
    }),
  )
  await writeFile(
    join(extension, 'entry.ts'),
    `import { defineAdapter, defineExtension, z } from ${JSON.stringify(join(repoRoot, 'packages', 'extension-sdk', 'src', 'index.ts'))}

export default defineExtension({
  id: 'fixture.blocking-extension',
  adapters: [defineAdapter({
    id: 'fixture.blocking',
    configSchema: z.object({ gate_path: z.string().min(1) }),
    profiles: [],
    routing: 'indexed',
    capabilities: ['sync'],
    operations: {
      sync: async (context) => {
        while (!(await Bun.file(context.source.config.gate_path).exists())) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        await context.emit({ type: 'checkpoint', cursor: { released: true } })
      },
    },
    actions: {},
  })],
})\n`,
  )
  const configPath = join(runtime.roots.configRoot, 'config.toml')
  const config = await readConfig(configPath)
  await writeConfig(
    { ...config, extensions: { paths: [extension] } },
    configPath,
  )
  expect((await runCli(runtime, ['realm', 'add', 'work'])).exitCode).toBe(0)
  const added = await runCli(runtime, [
    'source',
    'add',
    'fixture.blocking',
    '--realm',
    'work',
    '--label',
    'blocking',
    '--config-json',
    JSON.stringify({ gate_path: gate }),
  ])
  expect(added.exitCode, added.stderr).toBe(0)
  const stopped = await runCli(runtime, ['daemon', 'stop', '--format', 'json'])
  expect(stopped.exitCode, stopped.stderr).toBe(0)
  return { gate, sourceId: parseSourceId(added.stdout) }
}

async function expectStartFailure(runtime: TestRuntime, pattern: RegExp) {
  const contender = startDaemon(runtime)
  const result = await waitForExit(contender, 'contending daemon rejection')
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr).toMatch(pattern)
}

describe.skipIf(process.platform !== 'darwin')(
  'compiled local daemon multi-process workflow',
  () => {
    test('background start survives its CLI, converges concurrently, stops idempotently, and recovers after SIGKILL', async () => {
      const runtime = await createRuntime('ctxindex-daemon-background-')
      try {
        expect((await runCli(runtime, ['init'])).exitCode).toBe(0)

        expect(
          JSON.parse(
            (await runCli(runtime, ['daemon', 'status', '--format', 'json']))
              .stdout,
          ),
        ).toEqual({ status: 'stopped' })

        const concurrent = await Promise.all([
          runCli(runtime, ['realm', 'list', '--format', 'json']),
          runCli(runtime, ['realm', 'list', '--format', 'json']),
        ])
        for (const result of concurrent) {
          expect(result.exitCode, result.stderr).toBe(0)
          expect(JSON.parse(result.stdout)).toEqual([])
        }
        const automaticallyStarted = await runCli(runtime, [
          'daemon',
          'status',
          '--format',
          'json',
        ])
        expect(automaticallyStarted.exitCode, automaticallyStarted.stderr).toBe(
          0,
        )
        const instanceId = JSON.parse(automaticallyStarted.stdout).health
          .instanceId

        const reused = await runCli(runtime, [
          'daemon',
          'start',
          '--format',
          'json',
        ])
        expect(reused.exitCode, reused.stderr).toBe(0)
        expect(JSON.parse(reused.stdout)).toMatchObject({
          status: 'running',
          started: false,
          health: { instanceId },
        })

        const status = await runCli(runtime, [
          'daemon',
          'status',
          '--format',
          'json',
        ])
        expect(status.exitCode, status.stderr).toBe(0)
        const observed = JSON.parse(status.stdout)
        expect(observed).toMatchObject({
          status: 'running',
          health: { instanceId, ready: true },
        })

        process.kill(observed.health.pid, 'SIGKILL')
        await pollUntil('detached daemon process death', () => {
          try {
            process.kill(observed.health.pid, 0)
            return null
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              error.code === 'ESRCH'
            ) {
              return true
            }
            throw error
          }
        })

        const restarted = await runCli(runtime, [
          'daemon',
          'start',
          '--format',
          'json',
        ])
        expect(restarted.exitCode, restarted.stderr).toBe(0)
        expect(JSON.parse(restarted.stdout)).toMatchObject({
          status: 'running',
          started: true,
          health: { ready: true },
        })
        expect(JSON.parse(restarted.stdout).health.instanceId).not.toBe(
          instanceId,
        )

        const stopped = await runCli(runtime, [
          'daemon',
          'stop',
          '--format',
          'json',
        ])
        expect(stopped.exitCode, stopped.stderr).toBe(0)
        expect(JSON.parse(stopped.stdout)).toMatchObject({
          status: 'stopped',
          alreadyStopped: false,
        })
        expect(
          JSON.parse(
            (await runCli(runtime, ['daemon', 'stop', '--format', 'json']))
              .stdout,
          ),
        ).toEqual({ status: 'stopped', alreadyStopped: true })
      } finally {
        await runCli(runtime, ['daemon', 'stop', '--format', 'json']).catch(
          () => null,
        )
        await cleanupRuntime(runtime)
      }
    }, 45_000)

    test('canonical aliases contend, mismatched tuples are rejected, and distinct databases remain independent', async () => {
      const primary = await createRuntime('ctxindex-daemon-identity-')
      const children: RunningProcess[] = []
      try {
        expect((await runCli(primary, ['init'])).exitCode).toBe(0)
        const first = startDaemon(primary)
        children.push(first)
        const ready = await waitForReady(primary, first)

        const alias = join(primary.dir, 'alias')
        await symlink(primary.dir, alias)
        const aliased: TestRuntime = {
          ...primary,
          roots: {
            configRoot: join(alias, 'config'),
            dataRoot: join(alias, 'data'),
            stateRoot: join(alias, 'state'),
            cacheRoot: join(alias, 'cache'),
          },
          env: {
            ...primary.env,
            CTXINDEX_CONFIG_HOME: join(alias, 'config'),
            CTXINDEX_DATA_HOME: join(alias, 'data'),
            CTXINDEX_STATE_HOME: join(alias, 'state'),
            CTXINDEX_CACHE_HOME: join(alias, 'cache'),
          },
        }
        expect(resolveRuntimeIdentity(aliased.roots).identity).toEqual(
          resolveRuntimeIdentity(primary.roots).identity,
        )
        await expectStartFailure(aliased, /lease|owner|held|conflict/i)

        const differentDataPath = join(primary.dir, 'other-data')
        await mkdir(differentDataPath)
        const mismatched: TestRuntime = {
          ...primary,
          roots: { ...primary.roots, dataRoot: differentDataPath },
          env: {
            ...primary.env,
            CTXINDEX_DATA_HOME: differentDataPath,
          },
        }
        await expectStartFailure(mismatched, /runtime identity|metadata/i)

        const differentStatePath = join(primary.dir, 'other-state')
        const differentConfigPath = join(primary.dir, 'other-config')
        const differentCachePath = join(primary.dir, 'other-cache')
        await Promise.all(
          [differentStatePath, differentConfigPath, differentCachePath].map(
            (path) => mkdir(path),
          ),
        )
        await copyFile(
          join(primary.roots.configRoot, 'config.toml'),
          join(differentConfigPath, 'config.toml'),
        )
        const sharedDatabase: TestRuntime = {
          ...primary,
          roots: {
            configRoot: differentConfigPath,
            dataRoot: primary.roots.dataRoot,
            stateRoot: differentStatePath,
            cacheRoot: differentCachePath,
          },
          env: {
            ...primary.env,
            CTXINDEX_CONFIG_HOME: differentConfigPath,
            CTXINDEX_STATE_HOME: differentStatePath,
            CTXINDEX_CACHE_HOME: differentCachePath,
          },
        }
        await expectStartFailure(sharedDatabase, /lease|owner|held|conflict/i)

        const independent = await createRuntime('ctxindex-daemon-independent-')
        try {
          expect((await runCli(independent, ['init'])).exitCode).toBe(0)
          const second = startDaemon(independent)
          children.push(second)
          const secondReady = await waitForReady(independent, second)
          expect(secondReady.instanceId).not.toBe(ready.instanceId)
          expect(secondReady.databaseDigest).not.toBe(ready.databaseDigest)
          expect(
            (await runCli(primary, ['daemon', 'status', '--format', 'json']))
              .exitCode,
          ).toBe(0)
          expect(
            (
              await runCli(independent, [
                'daemon',
                'status',
                '--format',
                'json',
              ])
            ).exitCode,
          ).toBe(0)
        } finally {
          await cleanupRuntime(independent)
        }
      } finally {
        for (const child of children) await stopDaemon(child, 'SIGKILL')
        await cleanupRuntime(primary)
      }
    }, 30_000)

    test('metadata and override route separate CLI processes while a crashed daemon restarts without direct fallback', async () => {
      const runtime = await createRuntime('ctxindex-daemon-routing-')
      let daemon: RunningProcess | undefined
      try {
        const { sourceId } = await initializeLocalSource(runtime)
        const direct = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(direct.exitCode, direct.stderr).toBe(0)
        expect(JSON.parse(direct.stdout)).toEqual([
          expect.objectContaining({ sourceId, adapterId: 'local.directory' }),
        ])
        expect(
          (await runCli(runtime, ['daemon', 'stop', '--format', 'json']))
            .exitCode,
        ).toBe(0)

        const missingEndpoint = join(runtime.runtimeRoot, 'missing.sock')
        const unavailable = await runCli(
          runtime,
          ['status', '--source', sourceId, '--format', 'json'],
          { CTXINDEX_DAEMON_TEST_ENDPOINT: missingEndpoint },
        )
        expect(unavailable.exitCode).toBe(50)
        expect(unavailable.stdout).toBe('')
        expect(unavailable.stderr).toContain(
          'selected daemon test endpoint is unavailable',
        )

        daemon = startDaemon(runtime)
        const metadata = await waitForReady(runtime, daemon)
        const documentation = await runCli(runtime, [
          'docs',
          'list',
          '--format',
          'json',
        ])
        expect(documentation.exitCode, documentation.stderr).toBe(0)
        expect(JSON.parse(documentation.stdout)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              origin: 'bundled',
              path: 'getting-started.md',
            }),
            expect.objectContaining({
              origin: 'extension',
              extensionId: 'ctxindex.local',
              path: 'README.md',
            }),
          ]),
        )
        const extensionDocumentation = await runCli(runtime, [
          'docs',
          'get',
          'README.md',
          '--extension',
          'ctxindex.local',
        ])
        expect(
          extensionDocumentation.exitCode,
          extensionDocumentation.stderr,
        ).toBe(0)
        expect(extensionDocumentation.stdout).toContain('# Local directory')
        const daemonRealm = await runCli(runtime, [
          'realm',
          'add',
          'daemon-work',
          '--name',
          'Daemon Work',
        ])
        expect(daemonRealm.exitCode, daemonRealm.stderr).toBe(0)
        const realms = await runCli(runtime, [
          'realm',
          'list',
          '--format',
          'json',
        ])
        expect(realms.exitCode, realms.stderr).toBe(0)
        expect(JSON.parse(realms.stdout)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ slug: 'work' }),
            expect.objectContaining({ slug: 'daemon-work' }),
          ]),
        )
        const daemonSource = await runCli(runtime, [
          'source',
          'add',
          'local.directory',
          '--realm',
          'daemon-work',
          '--label',
          'daemon-files',
          '--config-root-path',
          join(runtime.dir, 'files'),
        ])
        expect(daemonSource.exitCode, daemonSource.stderr).toBe(0)
        const daemonSourceId = parseSourceId(daemonSource.stdout)
        const sources = await runCli(runtime, [
          'source',
          'list',
          '--format',
          'json',
        ])
        expect(sources.exitCode, sources.stderr).toBe(0)
        expect(JSON.parse(sources.stdout)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: sourceId, label: 'files' }),
            expect.objectContaining({
              id: daemonSourceId,
              label: 'daemon-files',
              realmSlug: 'daemon-work',
            }),
          ]),
        )
        const synced = await runCli(runtime, [
          'sync',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(synced.exitCode, synced.stderr).toBe(0)
        expect(JSON.parse(synced.stdout)).toEqual({
          mode: 'sync',
          results: [
            {
              sourceId,
              status: 'completed',
              run: expect.objectContaining({
                runId: expect.any(String),
                mode: 'sync',
                status: 'completed',
                added: 1,
                updated: 0,
                deleted: 0,
                warningsCount: 0,
                errorsCount: 0,
                lastWarning: null,
                warnings: [],
              }),
            },
          ],
          warnings: [],
        })

        const streamed = await runCli(runtime, [
          'sync',
          '--source',
          sourceId,
          '--format',
          'events',
        ])
        expect(streamed.exitCode, streamed.stderr).toBe(0)
        const syncEvents = streamed.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        expect(syncEvents[0]).toMatchObject({
          type: 'source.started',
          sequence: 0,
          sourceId,
          mode: 'sync',
        })
        expect(syncEvents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'source.progress',
              sourceId,
              processed: expect.any(Number),
            }),
          ]),
        )
        expect(syncEvents.at(-1)).toMatchObject({
          type: 'source.completed',
          sourceId,
          run: { status: 'completed' },
        })
        const progressEvents = syncEvents.filter(
          ({ sequence }) => sequence !== undefined,
        )
        expect(progressEvents.map(({ sequence }) => sequence)).toEqual(
          progressEvents.map((_, sequence) => sequence),
        )

        const searched = await runCli(runtime, [
          'search',
          'local daemon proof',
          '--source',
          'files',
          '--local-only',
          '--format',
          'json',
        ])
        expect(searched.exitCode, searched.stderr).toBe(0)
        const searchResult = JSON.parse(searched.stdout)
        expect(searchResult.results).toHaveLength(1)
        const resourceRef = searchResult.results[0]?.ref as string
        expect(resourceRef).toContain(sourceId)

        const retrieved = await runCli(runtime, [
          'get',
          resourceRef,
          '--format',
          'json',
        ])
        expect(retrieved.exitCode, retrieved.stderr).toBe(0)
        expect(JSON.parse(retrieved.stdout)).toEqual(
          expect.objectContaining({
            resource: expect.objectContaining({
              ref: resourceRef,
              sourceId,
              payload: expect.objectContaining({ text: expect.any(String) }),
            }),
          }),
        )

        const thread = await runCli(runtime, [
          'thread',
          resourceRef,
          '--format',
          'json',
        ])
        expect(thread.exitCode, thread.stderr).toBe(0)
        expect(JSON.parse(thread.stdout)).toEqual(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                resource: expect.objectContaining({ ref: resourceRef }),
              }),
            ]),
          }),
        )

        const removed = await runCli(runtime, [
          'source',
          'remove',
          'daemon-files',
        ])
        expect(removed.exitCode, removed.stderr).toBe(0)

        const status = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(status.exitCode, status.stderr).toBe(0)
        expect(JSON.parse(status.stdout)).toEqual([
          expect.objectContaining({
            sourceId,
            adapterId: 'local.directory',
            realmSlug: 'work',
            lastStatus: 'idle',
            warningsCount: 0,
            errorsCount: 0,
            lastError: null,
          }),
        ])

        const resolved = resolveRuntimeIdentity(runtime.roots)
        const endpoint = resolveEndpoint(resolved.identity, {
          runtimeRoot: runtime.runtimeRoot,
        })
        const discovery = discoveryMetadataPath(runtime.roots.stateRoot)
        const hiddenDiscovery = `${discovery}.hidden`
        await rename(discovery, hiddenDiscovery)
        const override = await runCli(
          runtime,
          ['status', '--source', sourceId, '--format', 'json'],
          { CTXINDEX_DAEMON_TEST_ENDPOINT: endpoint.path },
        )
        await rename(hiddenDiscovery, discovery)
        expect(override.exitCode, override.stderr).toBe(0)
        expect(JSON.parse(override.stdout)).toEqual(JSON.parse(status.stdout))

        const health = await runCli(runtime, [
          'daemon',
          'status',
          '--format',
          'json',
        ])
        expect(health.exitCode, health.stderr).toBe(0)
        expect(health.stdout).not.toContain(runtime.dir)
        expect(health.stdout).not.toContain(runtime.runtimeRoot)
        expect(health.stdout).not.toContain(endpoint.path)
        expect(JSON.parse(health.stdout)).toMatchObject({
          status: 'running',
          health: {
            instanceId: metadata.instanceId,
            ready: true,
            extensionDiagnosticsCount: 0,
          },
        })

        await stopDaemon(daemon, 'SIGKILL')
        daemon = undefined
        const database = resolved.databasePath
        const databaseBefore = await readFile(database)
        const recovered = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(recovered.exitCode, recovered.stderr).toBe(0)
        expect(JSON.parse(recovered.stdout)).toEqual(JSON.parse(status.stdout))
        expect(await readFile(database)).toEqual(databaseBefore)
        const recoveredHealth = await runCli(runtime, [
          'daemon',
          'status',
          '--format',
          'json',
        ])
        expect(recoveredHealth.exitCode, recoveredHealth.stderr).toBe(0)
        expect(JSON.parse(recoveredHealth.stdout).health.instanceId).not.toBe(
          metadata.instanceId,
        )
        expect(
          (await runCli(runtime, ['daemon', 'stop', '--format', 'json']))
            .exitCode,
        ).toBe(0)
      } finally {
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 30_000)

    test('secret backend status and idempotent selection stay on the daemon route', async () => {
      const runtime = await createRuntime('ctxindex-daemon-secrets-')
      let daemon: RunningProcess | undefined
      try {
        await initializeLocalSource(runtime)
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)

        const secretsStatus = await runCli(runtime, [
          'secrets',
          'status',
          '--format',
          'json',
        ])
        expect(secretsStatus.exitCode, secretsStatus.stderr).toBe(0)
        expect(JSON.parse(secretsStatus.stdout)).toMatchObject({
          backend: 'file',
          backends: {
            file: { available: true, referenceCount: 0 },
            keychain: { referenceCount: 0 },
          },
        })
        expect(secretsStatus.stdout).not.toContain(runtime.dir)

        const selected = await runCli(runtime, [
          'secrets',
          'backend',
          'set',
          'file',
        ])
        expect(selected.exitCode, selected.stderr).toBe(0)
        expect(selected.stdout).toContain('secrets backend set to file')
      } finally {
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 30_000)

    test('every direct SQLite command is fenced, shared holders block exclusivity, and SIGKILL releases permanent locks', async () => {
      const runtime = await createRuntime('ctxindex-daemon-fence-')
      let daemon: RunningProcess | undefined
      const holders: RunningProcess[] = []
      try {
        const { sourceId } = await initializeLocalSource(runtime)
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)

        const artifactList = await runCli(runtime, [
          'artifact',
          'list',
          `ctx://${sourceId}/file/one`,
          '--format',
          'json',
        ])
        expect(artifactList.exitCode, artifactList.stderr).toBe(2)
        expect(artifactList.stderr).not.toContain(
          'unavailable while the local daemon owns the database',
        )
        const artifactPurge = await runCli(runtime, [
          'artifact',
          'purge',
          '--format',
          'json',
        ])
        expect(artifactPurge.exitCode, artifactPurge.stderr).toBe(0)
        expect(JSON.parse(artifactPurge.stdout)).toMatchObject({
          artifactCountRemoved: 0,
          objectCountRemoved: 0,
        })

        const statefulCommands: readonly (readonly string[])[] = [
          ['init'],
          ['account', 'add', 'google', '--app', 'unavailable'],
          ['account', 'list'],
          ['oauth-app', 'list'],
        ]
        for (const args of statefulCommands) {
          const result = await runCli(runtime, args)
          expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(
            50,
          )
          expect(result.stdout).toBe('')
          expect(result.stderr).toContain(
            'unavailable while the local daemon owns the database',
          )
        }

        const described = await runCli(runtime, [
          'describe',
          'action',
          'missing.action',
          '--source',
          sourceId,
        ])
        expect(described.exitCode).toBe(2)
        expect(described.stdout).toBe('')
        expect(described.stderr).toContain('Unknown Action: missing.action')
        expect(described.stderr).not.toContain(
          'unavailable while the local daemon owns the database',
        )

        const resolved = resolveRuntimeIdentity(runtime.roots)
        const lock = leasePath({
          canonicalTarget: resolved.databasePath,
          purpose: 'database',
          mode: 'exclusive',
        })
        await stopDaemon(daemon, 'SIGKILL')
        daemon = undefined

        for (let index = 0; index < 2; index += 1) {
          const holder = await startLeaseHolder(runtime, resolved.databasePath)
          holders.push(holder)
        }
        await expectStartFailure(runtime, /lease|owner|held|conflict/i)

        const first = holders.shift()
        if (!first || typeof first.process.stdin !== 'object')
          throw new Error('missing shared holder stdin')
        first.process.stdin.end()
        expect(
          (await waitForExit(first, 'first shared holder exit')).exitCode,
        ).toBe(0)
        await expectStartFailure(runtime, /lease|owner|held|conflict/i)

        const second = holders.shift()
        if (!second) throw new Error('missing second shared holder')
        second.process.kill('SIGKILL')
        await waitForExit(second, 'second shared holder SIGKILL')
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)
        expect(await Bun.file(lock).exists()).toBe(true)
      } finally {
        for (const holder of holders) {
          if (holder.process.exitCode === null) holder.process.kill('SIGKILL')
          await waitForExit(holder, 'lease holder cleanup')
        }
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 30_000)

    test('SIGINT cancels a real local-directory sync without partial writes and leaves the daemon healthy', async () => {
      const runtime = await createRuntime('ctxindex-daemon-cancel-')
      let daemon: RunningProcess | undefined
      let sync: RunningProcess | undefined
      try {
        const { sourceId } = await initializeLocalSource(runtime, 8_000)
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)
        sync = spawnProcess(
          [cliExecutable, 'sync', '--source', sourceId, '--format', 'json'],
          runtime.env,
        )

        await pollUntil(
          'real local sync admission',
          async () => {
            const health = await runCli(runtime, [
              'daemon',
              'status',
              '--format',
              'json',
            ])
            if (health.exitCode !== 0) return null
            return JSON.parse(health.stdout).health.activeRequestCount === 1
              ? true
              : null
          },
          sync.process,
        )
        sync.process.kill('SIGINT')
        const cancelled = await waitForExit(sync, 'cancelled CLI exit')
        sync = undefined
        expect(cancelled.exitCode, cancelled.stderr).toBe(130)
        expect(cancelled.stdout).toBe('')
        expect(cancelled.stderr).toContain('cancelled')

        const healthy = await pollUntil(
          'daemon health after request cancellation',
          async () => {
            const result = await runCli(runtime, [
              'daemon',
              'status',
              '--format',
              'json',
            ])
            if (result.exitCode !== 0) return null
            const value = JSON.parse(result.stdout).health
            return value.ready === true && value.activeRequestCount === 0
              ? value
              : null
          },
          daemon.process,
        )
        expect(healthy.lifecycle).toBe('ready')

        const status = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(status.exitCode, status.stderr).toBe(0)
        expect(JSON.parse(status.stdout)).toEqual([
          expect.objectContaining({
            sourceId,
            lastStatus: 'failed',
            errorsCount: 1,
            cursor: null,
          }),
        ])

        const shutdown = await runCli(runtime, [
          'daemon',
          'stop',
          '--format',
          'json',
        ])
        expect(shutdown.exitCode, shutdown.stderr).toBe(0)
        await waitForExit(daemon, 'daemon exit after cancellation proof')
        daemon = undefined
        const searched = await runCli(runtime, [
          'search',
          'local daemon proof',
          '--local-only',
          '--format',
          'json',
        ])
        expect(searched.exitCode, searched.stderr).toBe(0)
        expect(JSON.parse(searched.stdout).results).toEqual([])
      } finally {
        if (sync?.process.exitCode === null) sync.process.kill('SIGKILL')
        if (sync) await waitForExit(sync, 'sync cleanup')
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 45_000)

    test('abrupt client disconnect cancels streamed sync and drains request tracking', async () => {
      const runtime = await createRuntime('ctxindex-daemon-disconnect-')
      let daemon: RunningProcess | undefined
      let sync: RunningProcess | undefined
      try {
        const { sourceId } = await initializeLocalSource(runtime, 8_000)
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)
        sync = spawnProcess(
          [cliExecutable, 'sync', '--source', sourceId, '--format', 'events'],
          runtime.env,
        )

        await pollUntil(
          'streamed sync admission before disconnect',
          async () => {
            const health = await runCli(runtime, [
              'daemon',
              'status',
              '--format',
              'json',
            ])
            if (health.exitCode !== 0) return null
            return JSON.parse(health.stdout).health.activeRequestCount === 1
              ? true
              : null
          },
          sync.process,
        )
        sync.process.kill('SIGKILL')
        await waitForExit(sync, 'disconnected CLI exit')
        sync = undefined

        const healthy = await pollUntil(
          'daemon health after abrupt client disconnect',
          async () => {
            const result = await runCli(runtime, [
              'daemon',
              'status',
              '--format',
              'json',
            ])
            if (result.exitCode !== 0) return null
            const value = JSON.parse(result.stdout).health
            return value.ready === true && value.activeRequestCount === 0
              ? value
              : null
          },
          daemon.process,
        )
        expect(healthy.lifecycle).toBe('ready')

        const status = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(status.exitCode, status.stderr).toBe(0)
        expect(JSON.parse(status.stdout)).toEqual([
          expect.objectContaining({
            sourceId,
            lastStatus: 'failed',
            errorsCount: 1,
            cursor: null,
          }),
        ])
      } finally {
        if (sync?.process.exitCode === null) sync.process.kill('SIGKILL')
        if (sync) await waitForExit(sync, 'disconnected sync cleanup')
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 45_000)

    test('concurrent shutdown times out without releasing ownership, then force termination permits restart and backup', async () => {
      const runtime = await createRuntime('ctxindex-daemon-shutdown-')
      let daemon: RunningProcess | undefined
      let sync: RunningProcess | undefined
      const shutdowns: RunningProcess[] = []
      try {
        const { sourceId } = await initializeBlockingSource(runtime)
        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)
        sync = spawnProcess(
          [cliExecutable, 'sync', '--source', sourceId, '--format', 'json'],
          runtime.env,
        )
        await pollUntil(
          'non-cooperative sync admission',
          async () => {
            const health = await runCli(runtime, [
              'daemon',
              'status',
              '--format',
              'json',
            ])
            if (health.exitCode !== 0) return null
            return JSON.parse(health.stdout).health.activeRequestCount === 1
              ? true
              : null
          },
          sync.process,
        )

        shutdowns.push(
          spawnProcess(
            [cliExecutable, 'daemon', 'stop', '--format', 'json'],
            runtime.env,
          ),
          spawnProcess(
            [cliExecutable, 'daemon', 'stop', '--format', 'json'],
            runtime.env,
          ),
        )
        await pollUntil(
          'daemon stopping metadata',
          () => {
            const resolved = resolveRuntimeIdentity(runtime.roots)
            const metadata = readMatchingDiscoveryMetadata(
              resolved.stateRoot,
              resolved.identity,
            )
            return metadata?.lifecycle === 'stopping' ? metadata : null
          },
          daemon.process,
        )

        const rejected = await runCli(runtime, [
          'status',
          '--source',
          sourceId,
          '--format',
          'json',
        ])
        expect(rejected.exitCode).toBe(50)
        expect(rejected.stdout).toBe('')
        expect(rejected.stderr).toContain('did not become ready')

        const direct = await runCli(runtime, ['realm', 'list'])
        expect(direct.exitCode).toBe(50)
        expect(direct.stderr).toContain('did not become ready')
        await expectStartFailure(runtime, /lease|owner|held|conflict/i)

        const timedOut = await Promise.all(
          shutdowns.splice(0).map((child) => commandResult(child)),
        )
        expect(timedOut).toHaveLength(2)
        for (const result of timedOut) {
          expect(result.exitCode).toBe(50)
          expect(result.stdout).toBe('')
          expect(result.stderr).toContain(
            'did not finish shutdown before the observation timeout',
          )
          expect(result.stderr).not.toContain('shutdown complete')
        }
        expect(daemon.process.exitCode).toBeNull()
        expect(sync.process.exitCode).toBeNull()

        const resolved = resolveRuntimeIdentity(runtime.roots)
        const lifecycleLock = leasePath({
          canonicalTarget: resolved.stateRoot,
          purpose: 'lifecycle',
          mode: 'exclusive',
        })
        const databaseLock = leasePath({
          canonicalTarget: resolved.databasePath,
          purpose: 'database',
          mode: 'exclusive',
        })
        expect(await Bun.file(lifecycleLock).exists()).toBe(true)
        expect(await Bun.file(databaseLock).exists()).toBe(true)

        await stopDaemon(daemon, 'SIGKILL')
        daemon = undefined
        await waitForExit(sync, 'sync disconnect after force termination')
        sync = undefined

        daemon = startDaemon(runtime)
        await waitForReady(runtime, daemon)
        const stopped = await runCli(runtime, [
          'daemon',
          'stop',
          '--format',
          'json',
        ])
        expect(stopped.exitCode, stopped.stderr).toBe(0)
        await waitForExit(daemon, 'restarted daemon graceful exit')
        daemon = undefined

        const backup = join(runtime.dir, 'ctxindex.sqlite.backup')
        await copyFile(resolved.databasePath, backup)
        expect(await Bun.file(backup).exists()).toBe(true)
        expect((await runCli(runtime, ['realm', 'list'])).exitCode).toBe(0)
      } finally {
        for (const child of shutdowns) {
          if (child.process.exitCode === null) child.process.kill('SIGKILL')
          await waitForExit(child, 'shutdown client cleanup')
        }
        if (sync?.process.exitCode === null) sync.process.kill('SIGKILL')
        if (sync) await waitForExit(sync, 'blocking sync cleanup')
        if (daemon) await stopDaemon(daemon, 'SIGKILL')
        await cleanupRuntime(runtime)
      }
    }, 45_000)
  },
)

describe.skipIf(process.platform !== 'linux')(
  'compiled Linux on-demand daemon lifecycle',
  () => {
    test('starts on first stateful command, reuses the packaged daemon, retains flock ownership, and stops cleanly', async () => {
      const runtime = await createRuntime('ctxindex-daemon-linux-lifecycle-')
      try {
        expect((await runCli(runtime, ['init'])).exitCode).toBe(0)
        expect(
          JSON.parse(
            (await runCli(runtime, ['daemon', 'status', '--format', 'json']))
              .stdout,
          ),
        ).toEqual({ status: 'stopped' })

        const first = await runCli(runtime, [
          'realm',
          'list',
          '--format',
          'json',
        ])
        expect(first.exitCode, first.stderr).toBe(0)
        expect(JSON.parse(first.stdout)).toEqual([])

        const running = await runCli(runtime, [
          'daemon',
          'status',
          '--format',
          'json',
        ])
        expect(running.exitCode, running.stderr).toBe(0)
        const firstHealth = JSON.parse(running.stdout).health
        expect(firstHealth).toMatchObject({ ready: true })

        const reused = await runCli(runtime, [
          'daemon',
          'start',
          '--format',
          'json',
        ])
        expect(reused.exitCode, reused.stderr).toBe(0)
        expect(JSON.parse(reused.stdout)).toMatchObject({
          status: 'running',
          started: false,
          health: { instanceId: firstHealth.instanceId, ready: true },
        })

        const resolved = resolveRuntimeIdentity(runtime.roots)
        for (const [canonicalTarget, purpose] of [
          [resolved.stateRoot, 'lifecycle'],
          [resolved.databasePath, 'database'],
        ] as const) {
          const path = leasePath({
            canonicalTarget,
            purpose,
            mode: 'exclusive',
          })
          expect((await stat(path)).mode & 0o777).toBe(0o600)
        }
        await expectStartFailure(runtime, /lease|owner|held|conflict/i)

        const stopped = await runCli(runtime, [
          'daemon',
          'stop',
          '--format',
          'json',
        ])
        expect(stopped.exitCode, stopped.stderr).toBe(0)
        expect(JSON.parse(stopped.stdout)).toMatchObject({
          status: 'stopped',
          alreadyStopped: false,
        })

        const restarted = await runCli(runtime, [
          'daemon',
          'start',
          '--format',
          'json',
        ])
        expect(restarted.exitCode, restarted.stderr).toBe(0)
        expect(JSON.parse(restarted.stdout)).toMatchObject({
          status: 'running',
          started: true,
          health: { ready: true },
        })
        expect(JSON.parse(restarted.stdout).health.instanceId).not.toBe(
          firstHealth.instanceId,
        )
      } finally {
        await runCli(runtime, ['daemon', 'stop', '--format', 'json']).catch(
          () => null,
        )
        await cleanupRuntime(runtime)
      }
    }, 45_000)
  },
)
