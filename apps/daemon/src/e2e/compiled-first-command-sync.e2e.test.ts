import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig, writeConfig } from '@ctxindex/core/config'

interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface CompiledCliHarness {
  readonly executable: string
  run(
    args: readonly string[],
    env: Readonly<Record<string, string>>,
  ): Promise<CliResult>
  cleanup(): Promise<void>
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')

// The compiled CLI resolves `ctxindex-daemon` beside its own executable, so
// both binaries are built into one directory, as a release would ship them.
async function buildCompiledCliHarness(): Promise<CompiledCliHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-first-sync-build-'))
  const executable = join(dir, 'ctxindex')
  const builds: readonly (readonly [entrypoint: string, output: string])[] = [
    ['apps/cli/bin/ctxindex.mjs', executable],
    ['apps/daemon/src/main.ts', join(dir, 'ctxindex-daemon')],
  ]
  await Promise.all(
    builds.map(async ([entrypoint, output]) => {
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
    }),
  )

  return {
    executable,
    async run(args, env) {
      const child = Bun.spawn([executable, ...args], {
        cwd: '/',
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, exitCode }
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

// Compiled acceptance for typed sync streaming when `sync` is the first command
// for a runtime: the CLI must start the detached daemon itself, then preserve
// producer-ordered progress, exactly one terminal outcome, complete output
// through a slow pipe, SIGINT cancellation, and stable presentation and exits.
// End-to-end producer backpressure is a recorded known defect below. A local
// fixture Extension stands in for a provider, so nothing touches the network.
// The daemon runs with the internal short idle timeout, so these journeys also
// prove that idle exit follows settlement and the next stateful command
// restarts the daemon.

const nativePlatform =
  process.platform === 'linux' || process.platform === 'darwin'
const IDLE_TIMEOUT_MS = 1_500
const deadlineMs = 30_000

// Far more progress than kernel socket and pipe buffers hold, so an unbounded
// producer would finish while the consumer is stopped.
const STREAMED_EVENTS = 20_000

let harness: CompiledCliHarness | undefined

beforeAll(async () => {
  if (nativePlatform) harness = await buildCompiledCliHarness()
}, 120_000)

afterAll(async () => {
  await harness?.cleanup()
})

// The adapter emits `count` checkpoints, recording how many it has emitted in
// `counter_path`; each emit awaits the daemon stream's one-item handoff. It then
// waits for `gate_path` (until cancelled) when configured and finally fails
// when `fail` is set.
const fixtureEntry = `import { defineAdapter, defineExtension, syncError, z } from ${JSON.stringify(join(repoRoot, 'packages', 'extension-sdk', 'src', 'index.ts'))}

export default defineExtension({
  id: 'fixture.stream-extension',
  adapters: [defineAdapter({
    id: 'fixture.stream',
    configSchema: z.object({
      count: z.number().int().positive(),
      counter_path: z.string().min(1),
      gate_path: z.string().min(1).optional(),
      fail: z.boolean().optional(),
    }),
    profiles: [],
    routing: 'indexed',
    capabilities: ['sync'],
    operations: {
      sync: async (context) => {
        const config = context.source.config
        for (let index = 1; index <= config.count; index += 1) {
          await context.emit({ type: 'checkpoint', cursor: { index } })
          if (index % 50 === 0 || index === config.count) {
            await Bun.write(config.counter_path, String(index))
          }
        }
        if (config.gate_path) {
          while (!(await Bun.file(config.gate_path).exists())) {
            context.signal.throwIfAborted()
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        }
        if (config.fail) {
          throw syncError('rate_limited', 'Fixture provider is rate limited')
        }
      },
    },
    actions: {},
  })],
})
`

interface StreamEvent {
  readonly type: string
  readonly sequence: number
  readonly processed?: number
  readonly exitCode?: number
  readonly error?: { readonly code: string }
}

async function isolatedRuntime() {
  if (!harness) throw new Error('Compiled executables were not built')
  const compiled = harness
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-first-sync-'))
  // A short root keeps the daemon socket path within the macOS limit.
  const runtimeRoot = await mkdtemp('/tmp/ctxd-sync-')
  const env: Record<string, string> = {
    HOME: dir,
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    NODE_ENV: 'test',
    NO_COLOR: '1',
    CTXINDEX_CONFIG_HOME: join(dir, 'config'),
    CTXINDEX_DATA_HOME: join(dir, 'data'),
    CTXINDEX_STATE_HOME: join(dir, 'state'),
    CTXINDEX_CACHE_HOME: join(dir, 'cache'),
    CTXINDEX_KEYTAR_MOCK_FILE: join(dir, 'keytar.json'),
    CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
    CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS: String(IDLE_TIMEOUT_MS),
    // No provider or network dependence: any outbound HTTP fails.
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
  }
  const run = (args: readonly string[]) => compiled.run(args, env)

  const expectOk = async (args: readonly string[]) => {
    const result = await run(args)
    expect({ args, exitCode: result.exitCode }, result.stderr).toEqual({
      args,
      exitCode: 0,
    })
    return result.stdout
  }

  const daemonStatus = async () =>
    JSON.parse(await expectOk(['daemon', 'status', '--format', 'json'])) as {
      readonly status: string
      readonly health?: {
        readonly instanceId: string
        readonly activeRequestCount: number
      }
    }

  const addSource = async (label: string, config: Record<string, unknown>) => {
    const added = await expectOk([
      'source',
      'add',
      'fixture.stream',
      '--realm',
      'work',
      '--label',
      label,
      '--config-json',
      JSON.stringify(config),
    ])
    const id = /^source added: (.+)$/m.exec(added)?.[1]
    if (!id) throw new Error(`Could not parse Source id: ${added}`)
    return id
  }

  // Sync must be the first command, so setup ends with an explicit stop.
  const stopDaemon = async () => {
    await expectOk(['daemon', 'stop', '--format', 'json'])
    expect(await daemonStatus()).toEqual({ status: 'stopped' })
  }

  // Every daemon started for this runtime is stopped, even when setup fails.
  const cleanup = async () => {
    await run(['daemon', 'stop']).catch(() => undefined)
    await rm(dir, { recursive: true, force: true })
    await rm(runtimeRoot, { recursive: true, force: true })
  }

  try {
    await setUpStreamExtension(dir, env, expectOk)
  } catch (error) {
    await cleanup()
    throw error
  }

  return {
    dir,
    env,
    executable: compiled.executable,
    run,
    daemonStatus,
    addSource,
    stopDaemon,
    cleanup,
  }
}

async function setUpStreamExtension(
  dir: string,
  env: Record<string, string>,
  expectOk: (args: readonly string[]) => Promise<string>,
) {
  await expectOk(['init'])
  const extension = join(dir, 'stream-extension')
  await mkdir(extension)
  await writeFile(
    join(extension, 'package.json'),
    JSON.stringify({
      name: '@ctxindex/stream-extension-fixture',
      private: true,
      type: 'module',
      ctxindex: { extensions: ['./entry.ts'] },
    }),
  )
  await writeFile(join(extension, 'entry.ts'), fixtureEntry)
  const configPath = join(env.CTXINDEX_CONFIG_HOME as string, 'config.toml')
  await writeConfig(
    { ...(await readConfig(configPath)), extensions: { paths: [extension] } },
    configPath,
  )
  await expectOk(['realm', 'add', 'work'])
}

// A sync child whose stdout is collected incrementally, so a journey can act
// on progress while the command is still streaming.
function spawnSync(
  executable: string,
  env: Record<string, string>,
  args: readonly string[],
) {
  const child = Bun.spawn([executable, 'sync', ...args], {
    cwd: '/',
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  let stdout = ''
  const stdoutDone = (async () => {
    const decoder = new TextDecoder()
    for await (const chunk of child.stdout) {
      stdout += decoder.decode(chunk, { stream: true })
    }
  })()
  const stderr = new Response(child.stderr).text()
  return {
    child,
    output: () => stdout,
    async result() {
      const exitCode = await child.exited
      await stdoutDone
      return { exitCode, stdout, stderr: await stderr }
    },
  }
}

// Runs a command whose stdout pipe is not read for a second, so its writes
// outrun the pipe buffer, then collects everything the command wrote.
async function runPipedToSlowReader(
  runtime: Awaited<ReturnType<typeof isolatedRuntime>>,
  args: readonly string[],
): Promise<CliResult> {
  const output = join(runtime.dir, 'piped-output')
  const child = Bun.spawn(
    [
      'bash',
      '-c',
      'set -o pipefail; out="$1"; shift; "$@" | { sleep 1; cat; } > "$out"',
      'piped',
      output,
      runtime.executable,
      ...args,
    ],
    {
      cwd: '/',
      env: runtime.env,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )
  const [stderr, exitCode] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stderr, stdout: await readFile(output, 'utf8') }
}

async function pollUntil<T>(
  description: string,
  probe: () => Promise<T | null | undefined | false>,
): Promise<T> {
  const deadline = Date.now() + deadlineMs
  while (Date.now() <= deadline) {
    const value = await probe()
    if (value) return value
    await Bun.sleep(25)
  }
  throw new Error(`${description}: deadline exceeded`)
}

async function emittedCount(path: string): Promise<number> {
  return Number(await readFile(path, 'utf8').catch(() => '0'))
}

function parseEvents(stdout: string): StreamEvent[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent)
}

describe.skipIf(!nativePlatform)('compiled first-command sync', () => {
  test('the first sync starts the daemon and streams ordered typed progress with one terminal before idle exit', async () => {
    const runtime = await isolatedRuntime()
    try {
      const sourceId = await runtime.addSource('stream', {
        count: STREAMED_EVENTS,
        counter_path: join(runtime.dir, 'emitted'),
      })
      await runtime.stopDaemon()

      const result = await runtime.run([
        'sync',
        '--source',
        sourceId,
        '--format',
        'events',
      ])
      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.stderr).toBe('')

      // Producer order: started, every progress step, then one terminal.
      const events = parseEvents(result.stdout)
      expect(events).toHaveLength(STREAMED_EVENTS + 2)
      expect(events.slice(0, -1).map((event) => event.sequence)).toEqual(
        events.slice(0, -1).map((_, index) => index),
      )
      expect(events[0]).toMatchObject({ type: 'source.started', sourceId })
      const progress = events.slice(1, -1)
      expect(progress.every((event) => event.type === 'source.progress')).toBe(
        true,
      )
      expect(progress.map((event) => event.processed)).toEqual(
        progress.map((_, index) => index + 1),
      )
      expect(events.at(-1)).toMatchObject({
        type: 'source.completed',
        sourceId,
        run: { status: 'completed', errorsCount: 0 },
      })

      // Piped output stays complete while its reader falls behind.
      const piped = await runPipedToSlowReader(runtime, [
        'sync',
        '--source',
        sourceId,
        '--format',
        'events',
      ])
      expect(piped.exitCode, piped.stderr).toBe(0)
      expect(parseEvents(piped.stdout)).toHaveLength(STREAMED_EVENTS + 2)

      // Settlement starts a fresh idle interval: the daemon the sync started
      // exits on its own, and the next stateful command starts a new one.
      await pollUntil(
        'idle exit after settlement',
        async () => (await runtime.daemonStatus()).status === 'stopped',
      )
      const status = JSON.parse(
        (
          await runtime.run([
            'status',
            '--source',
            sourceId,
            '--format',
            'json',
          ])
        ).stdout,
      )
      expect(status).toEqual([
        expect.objectContaining({ sourceId, lastStatus: 'idle' }),
      ])
      expect((await runtime.daemonStatus()).status).toBe('running')
    } finally {
      await runtime.cleanup()
    }
  }, 120_000)

  // Known defect: daemon-operation-streams "Backpressure and stream cleanup"
  // requires consumer progress to backpressure the producer, but Bun 1.3.14's
  // Bun.serve keeps pulling a streamed response body regardless of socket
  // pressure (Bun 1.4.2 stalls correctly). Once fixed, this becomes `test`.
  test.failing('known defect (Bun 1.3.14 Bun.serve): a stopped consumer bounds the producer and keeps its stream past the idle timeout', async () => {
    const runtime = await isolatedRuntime()
    let sync: ReturnType<typeof spawnSync> | undefined
    try {
      const counter = join(runtime.dir, 'emitted')
      const sourceId = await runtime.addSource('stream', {
        count: STREAMED_EVENTS,
        counter_path: counter,
      })

      sync = spawnSync(runtime.executable, runtime.env, [
        '--source',
        sourceId,
        '--format',
        'events',
      ])
      await pollUntil('first streamed progress', async () =>
        sync?.output().includes('"source.progress"'),
      )

      // The one-item handoff must stall the producer far below the total,
      // while the admitted stream keeps the daemon alive past the idle timeout.
      sync.child.kill('SIGSTOP')
      const stalled = await pollUntil('producer stall', async () => {
        const before = await emittedCount(counter)
        await Bun.sleep(IDLE_TIMEOUT_MS)
        const after = await emittedCount(counter)
        return before === after ? after : null
      })
      expect(stalled).toBeLessThan(STREAMED_EVENTS / 2)
      expect(await runtime.daemonStatus()).toMatchObject({
        status: 'running',
        health: { activeRequestCount: 1 },
      })

      sync.child.kill('SIGCONT')
      const result = await sync.result()
      sync = undefined
      expect(result.exitCode, result.stderr).toBe(0)
      expect(parseEvents(result.stdout)).toHaveLength(STREAMED_EVENTS + 2)
    } finally {
      if (sync) {
        sync.child.kill('SIGCONT')
        sync.child.kill('SIGKILL')
        await sync.result()
      }
      await runtime.cleanup()
    }
  }, 120_000)

  test('a first sync cancelled by SIGINT exits 130 and a declared provider failure keeps its stable exit and presentation', async () => {
    const runtime = await isolatedRuntime()
    let sync: ReturnType<typeof spawnSync> | undefined
    try {
      const counter = join(runtime.dir, 'gated-emitted')
      const gatedId = await runtime.addSource('gated', {
        count: 3,
        counter_path: counter,
        gate_path: join(runtime.dir, 'never-released'),
      })
      const failingId = await runtime.addSource('failing', {
        count: 2,
        counter_path: join(runtime.dir, 'failing-emitted'),
        fail: true,
      })
      await runtime.stopDaemon()

      sync = spawnSync(runtime.executable, runtime.env, [
        '--source',
        gatedId,
        '--format',
        'json',
      ])
      await pollUntil(
        'gated sync admission',
        async () => (await emittedCount(counter)) === 3,
      )
      sync.child.kill('SIGINT')
      const cancelled = await sync.result()
      sync = undefined
      expect(cancelled.exitCode, cancelled.stderr).toBe(130)
      expect(cancelled.stdout).toBe('')
      expect(cancelled.stderr).toContain('cancelled')
      await pollUntil('cancelled Sync Run bookkeeping', async () =>
        (
          await runtime.run(['status', '--source', gatedId, '--format', 'json'])
        ).stdout.includes('"lastStatus":"failed"'),
      )

      // A declared provider failure is one typed terminal event and keeps the
      // stable rate-limited exit in every presentation.
      const events = await runtime.run([
        'sync',
        '--source',
        failingId,
        '--format',
        'events',
      ])
      expect(events.exitCode, events.stderr).toBe(20)
      expect(parseEvents(events.stdout).map((event) => event.type)).toEqual([
        'source.started',
        'source.progress',
        'source.progress',
        'source.failed',
      ])
      expect(parseEvents(events.stdout).at(-1)).toMatchObject({
        sourceId: failingId,
        error: { code: 'rate_limited' },
        exitCode: 20,
      })

      const compact = await runtime.run([
        'sync',
        '--source',
        failingId,
        '--format',
        'compact',
      ])
      expect(compact.exitCode, compact.stderr).toBe(20)
      expect(compact.stdout).toBe(
        `${failingId} failed warnings=0 errors=1 code=rate_limited exit=20 error=Sync_failed_for_Source_"${failingId}"_(rate_limited)\n`,
      )
    } finally {
      if (sync) {
        sync.child.kill('SIGKILL')
        await sync.result()
      }
      await runtime.cleanup()
    }
  }, 120_000)
})
