import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  buildCompiledCliHarness,
  type CliResult,
  type CompiledCliHarness,
} from './_compiled-cli-harness'

// Compiled ownership acceptance across the locally runnable daemon-owned
// command inventory, plus the daemon executable's foreground debug entry.
// tests/tooling/cli/compiled-command-coverage.test.ts maps every command leaf
// and lifecycle property to this or another compiled journey.

const nativePlatform =
  process.platform === 'linux' || process.platform === 'darwin'
const databaseFiles = ['', '-wal', '-shm'].map((s) => `ctxindex.sqlite${s}`)
const deadlineMs = 15_000

let harness: CompiledCliHarness | undefined

beforeAll(async () => {
  if (nativePlatform) harness = await buildCompiledCliHarness()
}, 60_000)

afterAll(async () => {
  await harness?.cleanup()
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isolatedCli() {
  if (!harness) throw new Error('Compiled CLI harness was not initialized')
  const compiled = harness
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-ownership-'))
  // A short root keeps the daemon socket path within the macOS limit.
  const runtimeRoot = await mkdtemp('/tmp/ctxd-own-')
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
    // No provider or network dependence: any outbound HTTP fails.
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
  }
  const run = (args: readonly string[], extra: Record<string, string> = {}) =>
    compiled.run(args, { ...env, ...extra })
  const expectExit = async (
    args: readonly string[],
    exitCode: number,
    extra: Record<string, string> = {},
  ): Promise<CliResult> => {
    const result = await run(args, extra)
    expect({ args, exitCode: result.exitCode }, result.stderr).toEqual({
      args,
      exitCode,
    })
    return result
  }
  const json = async (args: readonly string[]) =>
    JSON.parse((await expectExit([...args, '--format', 'json'], 0)).stdout)
  const cleanup = async () => {
    await run(['daemon', 'stop']).catch(() => undefined)
    await rm(dir, { recursive: true, force: true })
    await rm(runtimeRoot, { recursive: true, force: true })
  }
  return {
    daemonExecutable: join(dirname(compiled.executable), 'ctxindex-daemon'),
    dir,
    env,
    run,
    expectExit,
    json,
    cleanup,
  }
}

// Once the daemon owns the database, the database files are made unreadable to
// every new opener. The daemon keeps its open handles, so a CLI that opened
// SQLite itself, or fell back to a direct route, would fail.
test.skipIf(!nativePlatform)(
  'compiled CLI keeps every stateful leaf on one daemon that alone can open the database',
  async () => {
    const cli = await isolatedCli()
    const { expectExit, json } = cli
    const setDatabaseMode = (mode: number) =>
      Promise.all(
        databaseFiles.map((name) =>
          chmod(join(cli.dir, 'data', name), mode).catch(
            (error: NodeJS.ErrnoException) => {
              if (name === databaseFiles[0] || error.code !== 'ENOENT')
                throw error
            },
          ),
        ),
      )
    const files = join(cli.dir, 'files')
    await mkdir(files)
    await writeFile(join(files, 'note.txt'), 'daemon ownership proof\n')

    try {
      await expectExit(['init'], 0)
      const owner = (await json(['daemon', 'start'])).health
      await setDatabaseMode(0o000)

      await expectExit(['realm', 'add', 'work'], 0)
      expect(await json(['realm', 'list'])).toEqual([
        expect.objectContaining({ slug: 'work' }),
      ])
      await expectExit(
        [
          'source',
          'add',
          'local.directory',
          '--realm',
          'work',
          '--label',
          'files',
          '--config-root-path',
          files,
        ],
        0,
      )
      expect(await json(['source', 'list'])).toEqual([
        expect.objectContaining({ label: 'files' }),
      ])
      expect((await json(['sync'])).results).toEqual([
        expect.objectContaining({ status: 'completed' }),
      ])
      const [found] = (
        await json(['search', 'daemon ownership proof', '--local-only'])
      ).results
      const ref = found.ref as string
      expect((await json(['get', ref])).resource.ref).toBe(ref)
      expect((await json(['thread', ref])).messages).toHaveLength(1)
      expect((await json(['export', ref])).text).toBe(
        'daemon ownership proof\n',
      )
      expect((await json(['artifact', 'list', ref])).artifacts).toEqual([])
      await expectExit(['artifact', 'download', `${ref}/attachment/x`], 2)
      expect(await json(['artifact', 'purge'])).toMatchObject({
        artifactCountRemoved: 0,
      })
      expect(await json(['status'])).toEqual([
        expect.objectContaining({ lastStatus: 'idle', errorsCount: 0 }),
      ])
      expect(await json(['docs', 'list'])).not.toEqual([])
      await expectExit(['docs', 'get', 'getting-started.md'], 0)
      expect(await json(['docs', 'search', 'daemon'])).not.toEqual([])
      expect((await json(['describe'])).sources).not.toEqual([])
      expect(await json(['extension', 'list'])).not.toEqual([])
      expect((await json(['secrets', 'status'])).backend).toBe('keychain')
      await expectExit(['secrets', 'backend', 'set', 'keychain'], 0)
      await expectExit(
        ['oauth-app', 'add', 'google', 'desktop', '--from-env'],
        0,
        {
          CTXINDEX_GOOGLE_CLIENT_ID: 'public-client-id',
          CTXINDEX_GOOGLE_CLIENT_SECRET: 'synthetic-client-secret',
        },
      )
      expect(await json(['oauth-app', 'list'])).toContainEqual(
        expect.objectContaining({ label: 'desktop', origin: 'local' }),
      )
      await expectExit(['oauth-app', 'remove', 'google', 'desktop'], 0)
      expect(await json(['account', 'list'])).toEqual([])
      await expectExit(['account', 'add', 'google', '--app', 'desktop'], 2)
      await expectExit(['account', 'remove', 'missing'], 2)
      await expectExit(
        [
          'action',
          'run',
          'mail.message.draft.create',
          '--source',
          'files',
          '--input',
          '{}',
        ],
        2,
      )
      await expectExit(['source', 'remove', 'files'], 0)

      // One immutable runtime owned every command above.
      expect((await json(['daemon', 'status'])).health).toMatchObject({
        instanceId: owner.instanceId,
        pid: owner.pid,
      })

      // Crash recovery: while the database stays unreadable, the next command
      // cannot start an owner and must not fall back to a direct open.
      process.kill(owner.pid, 'SIGKILL')
      while (isAlive(owner.pid)) await Bun.sleep(10)
      const blocked = await expectExit(
        ['realm', 'list', '--format', 'json'],
        50,
      )
      expect(blocked.stdout).toBe('')
      expect(blocked.stderr).toContain('local daemon did not become ready')
      await setDatabaseMode(0o600)
      const recovered = await json(['realm', 'list'])
      expect(recovered).toEqual([expect.objectContaining({ slug: 'work' })])
      const restarted = (await json(['daemon', 'status'])).health
      expect(restarted.instanceId).not.toBe(owner.instanceId)
      expect(await json(['daemon', 'stop'])).toMatchObject({
        status: 'stopped',
      })
    } finally {
      await setDatabaseMode(0o600).catch(() => undefined)
      await cli.cleanup()
    }
  },
  120_000,
)

// There is no public `daemon serve`: running the daemon executable directly is
// the deterministic foreground debug path. It serves the normal CLI route and
// releases ownership when it exits on SIGTERM.
test.skipIf(!nativePlatform)(
  'the daemon executable runs in the foreground as the debug entry and stops on SIGTERM',
  async () => {
    const cli = await isolatedCli()
    const { expectExit, json } = cli
    let daemon: ReturnType<typeof Bun.spawn> | undefined
    try {
      await expectExit(['init'], 0)
      expect(await json(['daemon', 'status'])).toEqual({ status: 'stopped' })
      daemon = Bun.spawn([cli.daemonExecutable], {
        cwd: '/',
        env: cli.env,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
      })
      const deadline = Date.now() + deadlineMs
      let health: { pid: number; ready: boolean } | undefined
      while (!health?.ready && Date.now() < deadline) {
        await Bun.sleep(25)
        const status = await cli.run(['daemon', 'status', '--format', 'json'])
        if (status.exitCode === 0) health = JSON.parse(status.stdout).health
      }
      expect(health).toMatchObject({ pid: daemon.pid, ready: true })

      expect(await json(['realm', 'list'])).toEqual([])
      expect((await json(['daemon', 'status'])).health.pid).toBe(daemon.pid)

      daemon.kill('SIGTERM')
      expect(await daemon.exited).toBe(0)
      expect(await json(['daemon', 'status'])).toEqual({ status: 'stopped' })
    } finally {
      if (daemon && daemon.exitCode === null) daemon.kill('SIGKILL')
      await cli.cleanup()
    }
  },
  60_000,
)
