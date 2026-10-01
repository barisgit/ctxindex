import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..', '..', '..', '..')
const fixtureRoot = join(import.meta.dir, 'fixtures', 'extension-registry')

interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

interface TestRuntime {
  readonly dir: string
  readonly configRoot: string
  readonly dataRoot: string
  readonly runtimeRoot: string
  readonly env: Record<string, string>
}

let buildRoot = ''
let cliExecutable = ''

async function run(
  command: readonly string[],
  options: { readonly cwd: string; readonly env?: Record<string, string> },
): Promise<CommandResult> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
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
  const build = await run(
    ['bun', 'build', '--compile', entrypoint, '--outfile', output],
    { cwd: repoRoot },
  )
  expect(build.exitCode, `${build.stdout}\n${build.stderr}`).toBe(0)
  await chmod(output, 0o755)
}

beforeAll(async () => {
  buildRoot = await mkdtemp(join(tmpdir(), 'ctxindex-registry-build-'))
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

async function createRuntime(prefix: string): Promise<TestRuntime> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const configRoot = join(dir, 'config')
  const dataRoot = join(dir, 'data')
  const runtimeRoot = await mkdtemp('/tmp/ctxd-e2e-')
  return {
    dir,
    configRoot,
    dataRoot,
    runtimeRoot,
    env: {
      HOME: process.env.HOME ?? '/',
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      NODE_ENV: 'test',
      NO_COLOR: '1',
      CTXINDEX_CONFIG_HOME: configRoot,
      CTXINDEX_DATA_HOME: dataRoot,
      CTXINDEX_STATE_HOME: join(dir, 'state'),
      CTXINDEX_CACHE_HOME: join(dir, 'cache'),
      CTXINDEX_DAEMON_RUNTIME_ROOT: runtimeRoot,
      CTXINDEX_KEYTAR_MOCK_FILE: join(dir, 'keytar.json'),
    },
  }
}

async function cleanupRuntime(runtime: TestRuntime) {
  await runCli(runtime, ['daemon', 'stop', '--format', 'json']).catch(
    () => null,
  )
  await rm(runtime.dir, { recursive: true, force: true })
  await rm(runtime.runtimeRoot, { recursive: true, force: true })
}

function runCli(
  runtime: TestRuntime,
  args: readonly string[],
  options: {
    readonly cwd?: string
    readonly env?: Record<string, string>
  } = {},
): Promise<CommandResult> {
  return run([cliExecutable, ...args], {
    cwd: options.cwd ?? '/',
    env: { ...runtime.env, ...options.env },
  })
}

async function expectJson(
  runtime: TestRuntime,
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<unknown> {
  const result = await runCli(runtime, [...args, '--format', 'json'], options)
  expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
  return JSON.parse(result.stdout)
}

async function runningInstance(runtime: TestRuntime): Promise<string> {
  const status = (await expectJson(runtime, ['daemon', 'status'])) as {
    status: string
    health?: { instanceId: string }
  }
  expect(status.status).toBe('running')
  return status.health?.instanceId as string
}

/** Bundles one fixture entry into an installable local Extension package. */
async function writeExtensionPackage(entry: string, packageRoot: string) {
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture-extension-registry',
      version: '1.0.0',
      type: 'module',
      ctxindex: { extensions: ['./dist/extension.js'] },
    }),
  )
  const build = await run(
    [
      'bun',
      'build',
      join(fixtureRoot, entry),
      '--outfile',
      join(packageRoot, 'dist', 'extension.js'),
      '--target=bun',
    ],
    { cwd: repoRoot },
  )
  expect(build.exitCode, build.stderr).toBe(0)
}

async function setConfiguredExtensionPaths(
  runtime: TestRuntime,
  paths: readonly string[],
) {
  const configPath = join(runtime.configRoot, 'config.toml')
  const initialized = await readFile(configPath, 'utf8')
  const updated = initialized.replace(
    /^paths = .*$/m,
    `paths = ${JSON.stringify(paths)}`,
  )
  expect(updated).not.toBe(initialized)
  await writeFile(configPath, updated)
}

describe.skipIf(process.platform !== 'linux' && process.platform !== 'darwin')(
  'compiled daemon Extension registry lifetime',
  () => {
    test('a relative configured Extension loads identically when the daemon starts from unrelated or aliased directories', async () => {
      const runtime = await createRuntime('ctxindex-ext-paths-')
      try {
        expect((await runCli(runtime, ['init'])).exitCode).toBe(0)
        await writeExtensionPackage(
          'path-identity.ts',
          join(runtime.dir, 'extensions', 'path-identity'),
        )
        // Persisted relative to config.toml, as a user would write it.
        await setConfiguredExtensionPaths(runtime, [
          '../extensions/path-identity',
        ])

        const unrelated = join(runtime.dir, 'unrelated', 'nested')
        const alias = join(runtime.dir, 'alias')
        await mkdir(unrelated, { recursive: true })
        await symlink(unrelated, alias)

        const observed = []
        for (const cwd of ['/', unrelated, alias]) {
          const listed = await runCli(
            runtime,
            ['extension', 'list', '--format', 'json'],
            { cwd },
          )
          expect(listed.exitCode, listed.stderr).toBe(0)
          // The daemon was launched by this command from `cwd`.
          await runningInstance(runtime)
          observed.push({ stdout: listed.stdout, stderr: listed.stderr })
          expect(
            (await runCli(runtime, ['daemon', 'stop', '--format', 'json']))
              .exitCode,
          ).toBe(0)
        }

        const listed = JSON.parse(observed[0]?.stdout ?? '[]') as {
          id: string
          provenance?: { kind: string; path?: string }
        }[]
        expect(listed.find(({ id }) => id === 'fixture.path-identity')).toEqual(
          expect.objectContaining({
            provenance: expect.objectContaining({
              kind: 'path',
              path: join(runtime.dir, 'extensions', 'path-identity'),
            }),
          }),
        )
        expect(observed[0]?.stderr).toBe('')
        expect(observed[1]).toEqual(observed[0])
        expect(observed[2]).toEqual(observed[0])

        // A missing relative Extension fails with the same bounded diagnostic
        // naming its canonical location, wherever the daemon starts.
        await setConfiguredExtensionPaths(runtime, ['../extensions/missing'])
        const failures = []
        for (const cwd of ['/', alias]) {
          const listed = await runCli(
            runtime,
            ['extension', 'list', '--format', 'json'],
            { cwd },
          )
          expect(listed.exitCode, listed.stderr).toBe(0)
          failures.push(listed)
          expect(
            (await runCli(runtime, ['daemon', 'stop', '--format', 'json']))
              .exitCode,
          ).toBe(0)
        }
        expect(failures[0]?.stderr).toContain(
          `Extension ${join(runtime.dir, 'extensions', 'missing')}: `,
        )
        expect(failures[1]).toEqual(failures[0])
      } finally {
        await cleanupRuntime(runtime)
      }
    }, 60_000)

    test('installed activation changes restart the daemon registry, keep the prior registry on failure, and leave filesystem-only Catalog reads alone', async () => {
      const runtime = await createRuntime('ctxindex-ext-activation-')
      const packageRoot = join(runtime.dir, 'packages', 'activation')
      const recordsPath = join(runtime.configRoot, 'direct-extensions.json')
      const listExtensions = async () =>
        (
          (await expectJson(runtime, ['extension', 'list'])) as {
            id: string
            adapters: { id: string }[]
          }[]
        ).find(({ id }) => id === 'fixture.activation')
      try {
        expect((await runCli(runtime, ['init'])).exitCode).toBe(0)
        expect((await runCli(runtime, ['daemon', 'start'])).exitCode).toBe(0)
        const initial = await runningInstance(runtime)
        expect(await listExtensions()).toBeUndefined()

        // Catalog inspection is filesystem-only and never touches the daemon.
        await expectJson(runtime, [
          'extension',
          'catalog',
          'list',
          '--no-refresh',
        ])
        expect(await runningInstance(runtime)).toBe(initial)

        await writeExtensionPackage('activation-v1.ts', packageRoot)
        const installed = await runCli(runtime, [
          'extension',
          'install',
          'local',
          packageRoot,
          'fixture.activation',
        ])
        expect(installed.exitCode, installed.stderr).toBe(0)
        expect(installed.stdout).toStartWith('Installed fixture.activation\t')
        // Output reports the durable install only; activation is observed below.
        expect(`${installed.stdout}${installed.stderr}`).not.toMatch(
          /\b(activated|reloaded|now active|registry)\b/i,
        )
        const afterInstall = await runningInstance(runtime)
        expect(afterInstall).not.toBe(initial)
        expect(await listExtensions()).toMatchObject({
          adapters: [{ id: 'fixture.activation.v1' }],
        })

        const app = await runCli(
          runtime,
          ['oauth-app', 'add', 'fixture.activation', 'work', '--from-env'],
          { env: { CTXINDEX_FIXTURE_ACTIVATION_CLIENT_ID: 'local-client' } },
        )
        expect(app.exitCode, app.stderr).toBe(0)

        // v2 declares an OAuth App colliding with the local one; the
        // runtime-complete registry rejects it and the prior one survives.
        const recordsBefore = await readFile(recordsPath, 'utf8')
        await rm(packageRoot, { recursive: true, force: true })
        await writeExtensionPackage('activation-v2.ts', packageRoot)
        const rejected = await runCli(runtime, [
          'extension',
          'update',
          'fixture.activation',
        ])
        expect(rejected.exitCode).not.toBe(0)
        expect(rejected.stdout).toBe('')
        expect(rejected.stderr).toMatch(/OAuth App/)
        expect(await readFile(recordsPath, 'utf8')).toBe(recordsBefore)
        const afterRejected = await runningInstance(runtime)
        expect(afterRejected).not.toBe(afterInstall)
        expect(await listExtensions()).toMatchObject({
          adapters: [{ id: 'fixture.activation.v1' }],
        })
        expect(await expectJson(runtime, ['oauth-app', 'list'])).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              providerId: 'fixture.activation',
              label: 'work',
              origin: 'local',
            }),
          ]),
        )

        // A valid update racing other stateful commands either commits and is
        // observed after restart, or fails bounded with the prior registry.
        // Racing commands succeed or fail bounded while the daemon is down.
        await rm(packageRoot, { recursive: true, force: true })
        await writeExtensionPackage('activation-v3.ts', packageRoot)
        let updating = true
        const updatePromise = runCli(runtime, [
          'extension',
          'update',
          'fixture.activation',
        ]).finally(() => {
          updating = false
        })
        const concurrent: CommandResult[] = []
        await Promise.all(
          Array.from({ length: 3 }, async () => {
            while (updating) {
              concurrent.push(
                await runCli(runtime, ['realm', 'list', '--format', 'json']),
              )
            }
          }),
        )
        const updated = await updatePromise
        expect([0, 50]).toContain(updated.exitCode)
        for (const result of concurrent) {
          expect([0, 50]).toContain(result.exitCode)
          if (result.exitCode !== 0) {
            expect(result.stderr).toMatch(
              /^(The local daemon is [^\n]+|[^\n]*The database is held by another local process\/runtime\.[^\n]*)\n$/,
            )
          }
        }
        const afterUpdate = await runningInstance(runtime)
        expect(afterUpdate).not.toBe(afterRejected)
        if (updated.exitCode === 0) {
          expect(await listExtensions()).toMatchObject({
            adapters: [{ id: 'fixture.activation.v3' }],
          })
        } else {
          // Lost the database lease to a racing daemon start: nothing changed.
          expect(updated.stderr).toMatch(/database|daemon/i)
          expect(await readFile(recordsPath, 'utf8')).toBe(recordsBefore)
          expect(await listExtensions()).toMatchObject({
            adapters: [{ id: 'fixture.activation.v1' }],
          })
        }

        const uninstalled = await runCli(runtime, [
          'extension',
          'uninstall',
          'fixture.activation',
        ])
        expect(uninstalled.exitCode, uninstalled.stderr).toBe(0)
        expect(await runningInstance(runtime)).not.toBe(afterUpdate)
        expect(await listExtensions()).toBeUndefined()
      } finally {
        await cleanupRuntime(runtime)
      }
    }, 90_000)
  },
)
