import { expect, test } from 'bun:test'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEnv, resetEnvForTests } from './env-loader'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const rootGlobalDependencies = ['**/.env', '**/.env.*', '**/bunfig.toml']
const gmailEnv = [
  'CTXINDEX_GOOGLE_CLIENT_ID',
  'CTXINDEX_GOOGLE_CLIENT_SECRET',
  'CTXINDEX_GOOGLE_REFRESH_TOKEN',
]
const workspaceTaskNames = [
  'build',
  'lint',
  'typecheck',
  'test',
  'test:integration',
  'test:e2e',
] as const

type TurboTask = {
  env?: unknown
}

type TurboJson = {
  extends?: unknown
  globalDependencies?: unknown
  tasks?: Record<string, TurboTask>
}

type PackageJson = {
  scripts?: Record<string, string>
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(join(repoRoot, path)).text())
}

async function readTurbo(path: string): Promise<TurboJson> {
  return readJson<TurboJson>(path)
}

function asStringArray(value: unknown, label: string): string[] {
  expect(Array.isArray(value), `${label} should be an array`).toBe(true)
  const strings = value as unknown[]
  for (const item of strings) {
    expect(typeof item, `${label} should contain only strings`).toBe('string')
  }
  return strings as string[]
}

function taskEnv(turbo: TurboJson, taskName: string, label: string): string[] {
  const task = turbo.tasks?.[taskName]
  expect(task, `${label} missing ${taskName} task`).toBeDefined()
  return asStringArray(task?.env, `${label}.${taskName}.env`)
}

function expectExtendsRoot(turbo: TurboJson, label: string): void {
  expect(asStringArray(turbo.extends, `${label}.extends`)).toContain('//')
}

async function runTurboDryJson(): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  const proc = Bun.spawn(
    [process.execPath, 'x', 'turbo', 'run', 'test', '--dry=json'],
    {
      cwd: repoRoot,
      env: { ...process.env },
      stdin: null,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, stdout, stderr }
}

test('globalDependencies present', async () => {
  const rootTurbo = await readTurbo('turbo.json')
  const deps = asStringArray(
    rootTurbo.globalDependencies,
    'turbo.globalDependencies',
  )

  expect(deps).toEqual(expect.arrayContaining(rootGlobalDependencies))
})

test('root has no extends', async () => {
  const rootTurbo = await readTurbo('turbo.json')

  expect('extends' in rootTurbo).toBe(false)
})

test('per-workspace env keys', async () => {
  const [cliTurbo, coreTurbo, adaptersTurbo] = await Promise.all([
    readTurbo('apps/cli/turbo.json'),
    readTurbo('packages/core/turbo.json'),
    readTurbo('packages/adapters/turbo.json'),
  ])

  expectExtendsRoot(cliTurbo, 'apps/cli/turbo.json')
  expectExtendsRoot(coreTurbo, 'packages/core/turbo.json')
  expectExtendsRoot(adaptersTurbo, 'packages/adapters/turbo.json')

  for (const [label, turbo] of [
    ['apps/cli/turbo.json', cliTurbo],
    ['packages/core/turbo.json', coreTurbo],
    ['packages/adapters/turbo.json', adaptersTurbo],
  ] as const) {
    for (const taskName of workspaceTaskNames) {
      taskEnv(turbo, taskName, label)
    }
  }

  expect(taskEnv(cliTurbo, 'test:e2e', 'apps/cli/turbo.json')).toEqual(
    expect.arrayContaining(gmailEnv),
  )
})

test('workspace lane scripts back turbo tasks', async () => {
  const packageJsons = await Promise.all([
    readJson<PackageJson>('apps/cli/package.json'),
    readJson<PackageJson>('packages/core/package.json'),
    readJson<PackageJson>('packages/adapters/package.json'),
  ])

  for (const packageJson of packageJsons) {
    expect(packageJson.scripts?.['test:integration']).toContain(
      'integration.test',
    )
    expect(packageJson.scripts?.['test:e2e']).toContain('e2e.test')
  }
})

test('turbo dry json parses', async () => {
  resetEnvForTests()
  if (getEnv().CTXINDEX_SKIP_TURBO_DRY_JSON === '1') {
    expect(true).toBe(true)
    return
  }

  const result = await runTurboDryJson()

  expect(result.exitCode, result.stderr).toBe(0)
  expect(() => JSON.parse(result.stdout)).not.toThrow()
})
