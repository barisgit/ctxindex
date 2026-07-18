import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as TOML from '@iarna/toml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const unitIgnoreGlobs = [
  '**/*.integration.test.ts',
  '**/*.e2e.test.ts',
] as const

type PackageJson = {
  scripts?: Record<string, string>
}

type Bunfig = {
  test?: {
    pathIgnorePatterns?: unknown
  }
}

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await Bun.file(join(repoRoot, 'package.json')).text())
}

async function readBunfig(): Promise<Bunfig> {
  return TOML.parse(
    await Bun.file(join(repoRoot, 'bunfig.toml')).text(),
  ) as Bunfig
}

async function readFullTestSuite(): Promise<string> {
  return Bun.file(join(repoRoot, 'scripts/verify/full-test-suite.sh')).text()
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

test('unit lane excludes integration', async () => {
  const [packageJson, bunfig] = await Promise.all([
    readPackageJson(),
    readBunfig(),
  ])

  expect(script(packageJson, 'test')).toBe('bun test')
  expect(
    asStringArray(bunfig.test?.pathIgnorePatterns, 'pathIgnorePatterns'),
  ).toEqual(expect.arrayContaining([...unitIgnoreGlobs]))
})

test('e2e lane isolated', async () => {
  const packageJson = await readPackageJson()
  const command = script(packageJson, 'test:e2e')

  expect(command).toContain('bun test')
  expect(command).toContain('--path-ignore-patterns')
  expect(command).toContain('__none__')
  expect(command).toContain('e2e.test')
  expect(command).not.toContain('integration.test')
})

test('full suite serializes tests with a hosted-runner timeout', async () => {
  const command = await readFullTestSuite()

  expect(command).toContain('--max-concurrency=1')
  expect(command).toContain('--timeout=30000')
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
