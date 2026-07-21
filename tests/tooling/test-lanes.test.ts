import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as TOML from '@iarna/toml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const unitIgnoreGlobs = [
  '**/*.integration.test.ts',
  '**/*.e2e.test.ts',
] as const

type PackageJson = {
  scripts?: Record<string, string>
}

async function readTurboConfig(): Promise<TurboConfig> {
  return JSON.parse(await Bun.file(join(repoRoot, 'turbo.json')).text())
}

type TurboConfig = {
  tasks?: Record<string, { inputs?: unknown; outputs?: unknown }>
}

type Bunfig = {
  test?: {
    pathIgnorePatterns?: unknown
  }
}

async function readPackageJson(directory = repoRoot): Promise<PackageJson> {
  return JSON.parse(await Bun.file(join(directory, 'package.json')).text())
}

async function readBunfig(): Promise<Bunfig> {
  return TOML.parse(
    await Bun.file(join(repoRoot, 'bunfig.toml')).text(),
  ) as Bunfig
}

function asStringArray(value: unknown, label: string): string[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true)
  const strings = value as unknown[]
  for (const item of strings) {
    expect(typeof item, `${label} should contain only strings`).toBe('string')
  }
  return strings as string[]
}

function script(packageJson: PackageJson, name: string): string {
  const command = packageJson.scripts?.[name]
  expect(typeof command, `missing package.json script ${name}`).toBe('string')
  return command as string
}

async function runBunTest(cwd: string): Promise<{
  exitCode: number
  output: string
}> {
  const proc = Bun.spawn([process.execPath, 'test'], {
    cwd,
    stdin: null,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, output: `${stdout}\n${stderr}` }
}

test('repository verifiers declare focused Turbo cache inputs', async () => {
  const turbo = await readTurboConfig()
  const focusedTasks = [
    '//#verify:package-dependencies',
    '//#verify:architecture',
    '//#verify:cli-no-business-logic',
    '//#verify:cli-framework',
    '//#verify:cli-command-drift',
    '//#verify:cli-thin-lines',
    '//#verify:cli-reference',
    '//#verify:exports-map',
    '//#verify:network-egress',
    '//#verify:no-prompts-static',
  ]

  for (const taskName of focusedTasks) {
    const task = turbo.tasks?.[taskName]
    expect(task, `missing turbo task ${taskName}`).toBeDefined()
    expect(
      asStringArray(task?.inputs, `${taskName}.inputs`).length,
    ).toBeGreaterThan(0)
    expect(task?.outputs).toEqual([])
  }

  expect(turbo.tasks?.['//#verify:cli-command-drift']?.inputs).toContain(
    '**/*.{md,mdx,sh,ts,tsx}',
  )
  expect(turbo.tasks?.['//#verify:network-egress']?.inputs).toContain(
    '{apps,packages}/**/*.ts',
  )
})

test('root developer commands have one canonical package script surface', async () => {
  const packageJson = await readPackageJson()

  expect(await Bun.file(join(repoRoot, 'justfile')).exists()).toBe(false)
  for (const duplicate of [
    'dev:web',
    'start:web',
    'build:cli-package',
    'with-timeout',
  ]) {
    expect(packageJson.scripts?.[duplicate]).toBeUndefined()
  }
})

async function hasTestFile(
  directory: string,
  pattern: string,
): Promise<boolean> {
  for await (const _ of new Bun.Glob(pattern).scan({
    cwd: directory,
    onlyFiles: true,
  })) {
    return true
  }
  return false
}

test('unit lane is package-owned and excludes integration', async () => {
  const [rootPackageJson, corePackageJson, bunfig] = await Promise.all([
    readPackageJson(),
    readPackageJson(join(repoRoot, 'packages/core')),
    readBunfig(),
  ])

  expect(script(rootPackageJson, 'test')).toBe('turbo run test //#test:tooling')
  expect(script(corePackageJson, 'test')).toContain('bun test')
  expect(script(corePackageJson, 'test')).toContain('NODE_ENV=test')
  expect(script(corePackageJson, 'test')).toContain(
    'CTXINDEX_KEYTAR_MOCK_FILE=',
  )
  expect(script(corePackageJson, 'test')).toContain('--max-concurrency=1')
  expect(script(corePackageJson, 'test')).toContain('--timeout=30000')
  expect(
    asStringArray(bunfig.test?.pathIgnorePatterns, 'pathIgnorePatterns'),
  ).toEqual(expect.arrayContaining([...unitIgnoreGlobs]))
})

test('every workspace with tests owns a unit task', async () => {
  const rootPackageJson = await readPackageJson()
  const workspaceDirectories = await Promise.all(
    (
      rootPackageJson as PackageJson & { workspaces?: string[] }
    ).workspaces?.map(async (pattern) => {
      const parent = join(repoRoot, pattern.replace(/\/\*$/, ''))
      return (await readdir(parent, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parent, entry.name))
    }) ?? [],
  )

  for (const directory of workspaceDirectories.flat()) {
    const packageJson = await readPackageJson(directory)
    const testScript = script(packageJson, 'test')
    expect(testScript, directory).toContain('bun test')
    for (const ignore of unitIgnoreGlobs) {
      expect(testScript, directory).toContain(ignore)
    }

    if (await hasTestFile(directory, '**/*.integration.test.ts')) {
      expect(script(packageJson, 'test:integration'), directory).toContain(
        'integration.test',
      )
    }
    if (await hasTestFile(directory, '**/*.e2e.test.ts')) {
      expect(script(packageJson, 'test:e2e'), directory).toContain('e2e.test')
    }
  }
})

test('e2e lane isolated', async () => {
  const [rootPackageJson, corePackageJson] = await Promise.all([
    readPackageJson(),
    readPackageJson(join(repoRoot, 'packages/core')),
  ])
  const command = script(corePackageJson, 'test:e2e')

  expect(script(rootPackageJson, 'test:e2e')).toBe('turbo run test:e2e')
  expect(command).toContain('bun test')
  expect(command).toContain('--path-ignore-patterns')
  expect(command).toContain('__none__')
  expect(command).toContain('e2e.test')
  expect(command).not.toContain('integration.test')
})

test('root integration task names every repository-owned integration test', async () => {
  const rootPackageJson = await readPackageJson()
  const command = script(rootPackageJson, 'test:integration:tooling')
  const integrationTests = [
    ...(await readdir(join(repoRoot, 'tests/tooling/release')))
      .filter((path) => path.endsWith('.integration.test.ts'))
      .map((path) => `tests/tooling/release/${path}`),
    ...(await readdir(join(repoRoot, 'tests/tooling/verify')))
      .filter((path) => path.endsWith('.integration.test.ts'))
      .map((path) => `tests/tooling/verify/${path}`),
  ]

  expect(integrationTests.length).toBeGreaterThan(0)
  for (const path of integrationTests) {
    expect(command).toContain(path)
  }
})

test('repository CI delegates independent gates to Turbo', async () => {
  const packageJson = await readPackageJson()
  const command = script(packageJson, 'ci')

  expect(command).toStartWith('turbo run ')
  expect(command).toContain('build lint typecheck test')
  expect(command).toContain('//#test:tooling')
  expect(command).toContain('//#verify:cli-framework')
  expect(command).toContain('//#verify:cli-command-drift')
  expect(command).toContain('//#verify:network-egress')
  expect(command).toContain('//#verify:no-prompts-static')
  expect(command).not.toContain('--max-concurrency=1')
  expect(command).not.toContain('full-test-suite')
})

test('path-ignore-patterns honored', async () => {
  const bunfig = await readBunfig()
  const patterns = asStringArray(
    bunfig.test?.pathIgnorePatterns,
    'pathIgnorePatterns',
  )
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-test-lanes-'))

  try {
    await writeFile(
      join(sandbox, 'bunfig.toml'),
      `[test]\npathIgnorePatterns = ${JSON.stringify(patterns)}\n`,
    )
    await writeFile(
      join(sandbox, 'unit.test.ts'),
      "import { expect, test } from 'bun:test'\n" +
        "test('unit runs', () => expect(1).toBe(1))\n",
    )
    await writeFile(
      join(sandbox, 'ignored.integration.test.ts'),
      "import { expect, test } from 'bun:test'\n" +
        "test('integration ignored', () => expect(1).toBe(2))\n",
    )
    await writeFile(
      join(sandbox, 'ignored.e2e.test.ts'),
      "import { expect, test } from 'bun:test'\n" +
        "test('e2e ignored', () => expect(1).toBe(2))\n",
    )

    const result = await runBunTest(sandbox)

    // The ignored files contain failing tests; if the patterns were not honored
    // the run would execute 3 files and exit non-zero. Asserting on the run
    // summary is robust to bun's reporter omitting filenames for a single
    // all-passing file.
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Ran 1 test across 1 file')
    expect(result.output).not.toContain('ignored.integration.test.ts')
    expect(result.output).not.toContain('ignored.e2e.test.ts')
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
})
