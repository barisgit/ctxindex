import { afterEach, expect, test } from 'bun:test'
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = join(repoRoot, 'scripts/worktree-new.sh')
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function run(
  command: string[],
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, {
    cwd,
    env,
    stdin: null,
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

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-worktree-new-'))
  tempDirs.push(root)

  expect((await run(['git', 'init', '-b', 'main'], root)).exitCode).toBe(0)
  expect(
    (await run(['git', 'config', 'user.email', 'test@example.com'], root))
      .exitCode,
  ).toBe(0)
  expect(
    (await run(['git', 'config', 'user.name', 'Worktree Test'], root)).exitCode,
  ).toBe(0)

  await mkdir(join(root, 'scripts'), { recursive: true })
  await copyFile(join(repoRoot, 'scripts/cli.sh'), join(root, 'scripts/cli.sh'))
  await mkdir(join(root, 'apps/cli/bin'), { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'worktree-fixture',
        private: true,
        scripts: { cli: 'bash scripts/cli.sh' },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(root, 'apps/cli/bin/ctxindex.mjs'),
    `import { cacheDir, configDir, dataDir, stateDir } from ${JSON.stringify(
      join(repoRoot, 'packages/core/src/paths/index.ts'),
    )}

console.log(JSON.stringify({
  config: configDir(),
  data: dataDir(),
  state: stateDir(),
  cache: cacheDir(),
}))\n`,
  )
  await writeFile(
    join(root, '.gitignore'),
    '.worktrees/\n.ctxindex/\n.env\n.envrc\n',
  )
  expect((await run(['git', 'add', '.'], root)).exitCode).toBe(0)
  expect((await run(['git', 'commit', '-m', 'fixture'], root)).exitCode).toBe(0)

  return root
}

function conflictingPathEnvironment(
  root: string,
): Record<string, string | undefined> {
  const env = { ...process.env }
  env.CTXINDEX_CONFIG_HOME = join(root, 'ambient/ctxindex-config')
  env.CTXINDEX_DATA_HOME = join(root, 'ambient/ctxindex-data')
  env.CTXINDEX_STATE_HOME = join(root, 'ambient/ctxindex-state')
  env.CTXINDEX_CACHE_HOME = join(root, 'ambient/ctxindex-cache')
  env.XDG_CONFIG_HOME = join(root, 'ambient/xdg-config')
  env.XDG_DATA_HOME = join(root, 'ambient/xdg-data')
  env.XDG_STATE_HOME = join(root, 'ambient/xdg-state')
  env.XDG_CACHE_HOME = join(root, 'ambient/xdg-cache')
  return env
}

test('a typed worktree automatically isolates root-level bun cli state', async () => {
  const root = await makeRepository()
  const branch = 'feature/worktree-isolation'
  const worktree = join(root, '.worktrees/feature-worktree-isolation')
  await writeFile(join(root, '.env'), 'PROVIDER_CLIENT_SECRET=do-not-copy\n')

  const created = await run(['bash', scriptPath, branch], root)

  expect(created.exitCode).toBe(0)
  const canonicalWorktree = await realpath(worktree)
  const expected = {
    config: join(canonicalWorktree, '.ctxindex/config'),
    data: join(canonicalWorktree, '.ctxindex/data'),
    state: join(canonicalWorktree, '.ctxindex/state'),
    cache: join(canonicalWorktree, '.ctxindex/cache'),
  }

  for (const invocation of [
    [process.execPath, 'cli'],
    [process.execPath, 'run', 'cli'],
  ]) {
    const cli = await run(
      invocation,
      worktree,
      conflictingPathEnvironment(root),
    )
    expect(cli.exitCode).toBe(0)
    expect(JSON.parse(cli.stdout)).toEqual(expected)
  }

  expect(await Bun.file(join(worktree, '.ctxindex/worktree')).exists()).toBe(
    true,
  )
  expect(await Bun.file(join(worktree, '.env')).exists()).toBe(false)
})

test('the root launcher preserves path overrides outside helper-created worktrees', async () => {
  const root = await makeRepository()
  const env = conflictingPathEnvironment(root)

  const cli = await run([process.execPath, 'cli'], root, env)

  expect(cli.exitCode).toBe(0)
  expect(JSON.parse(cli.stdout)).toEqual({
    config: env.CTXINDEX_CONFIG_HOME,
    data: env.CTXINDEX_DATA_HOME,
    state: env.CTXINDEX_STATE_HOME,
    cache: env.CTXINDEX_CACHE_HOME,
  })
})

test('usage advertises only the four supported branch types', async () => {
  const result = await run(['bash', scriptPath], repoRoot)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain('Types: feature, fix, docs, chore')
  expect(result.stderr).not.toMatch(
    /refactor|test|perf|ci|build|revert|spike|codex/,
  )
})

test.each([
  'feature/unsafe branch',
  'feature/-leading-dash',
  'feature/nested/name',
  'codex/10-worktree-isolation',
  'refactor/unsupported',
  'test/unsupported',
  'perf/unsupported',
  'ci/unsupported',
  'build/unsupported',
  'revert/unsupported',
  'spike/unsupported',
])('rejects unsafe or malformed branch name %s', async (branch) => {
  const root = await makeRepository()

  const result = await run(['bash', scriptPath, branch], root)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toMatch(/error:|Usage:/)
  expect(await run(['git', 'branch', '--list', branch], root)).toMatchObject({
    stdout: '',
  })
})

test('attaches an existing typed branch and reports an absent branch', async () => {
  const root = await makeRepository()
  expect(
    (await run(['git', 'branch', 'feature/existing-work'], root)).exitCode,
  ).toBe(0)

  const attached = await run(
    ['bash', scriptPath, '--existing', 'feature/existing-work'],
    root,
  )

  expect(attached.exitCode).toBe(0)
  expect(attached.stdout).toContain(
    'Attaching to local branch: feature/existing-work',
  )
  expect(
    await Bun.file(
      join(root, '.worktrees/feature-existing-work/.ctxindex/worktree'),
    ).exists(),
  ).toBe(true)

  const absent = await run(
    ['bash', scriptPath, '--existing', 'fix/absent-branch'],
    root,
  )
  expect(absent.exitCode).toBe(1)
  expect(absent.stderr).toContain(
    "error: branch 'fix/absent-branch' not found locally or on origin",
  )
})

test('rejects an existing branch without marker-aware CLI wiring before attach', async () => {
  const root = await makeRepository()
  expect(
    (await run(['git', 'switch', '-c', 'fix/pre-launcher-branch'], root))
      .exitCode,
  ).toBe(0)
  await rm(join(root, 'scripts/cli.sh'))
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'worktree-fixture',
        private: true,
        scripts: { cli: 'bun apps/cli/bin/ctxindex.mjs' },
      },
      null,
      2,
    )}\n`,
  )
  expect((await run(['git', 'add', '-A'], root)).exitCode).toBe(0)
  expect(
    (await run(['git', 'commit', '-m', 'legacy CLI wiring'], root)).exitCode,
  ).toBe(0)
  expect((await run(['git', 'switch', 'main'], root)).exitCode).toBe(0)

  const attached = await run(
    ['bash', scriptPath, '--existing', 'fix/pre-launcher-branch'],
    root,
  )

  expect(attached.exitCode).toBe(1)
  expect(attached.stderr).toContain(
    "error: branch 'fix/pre-launcher-branch' lacks marker-aware CLI wiring",
  )
  expect(
    await Bun.file(
      join(root, '.worktrees/fix-pre-launcher-branch/.ctxindex/worktree'),
    ).exists(),
  ).toBe(false)
  expect(
    (await run(['git', 'worktree', 'list', '--porcelain'], root)).stdout,
  ).not.toContain('.worktrees/fix-pre-launcher-branch')
})
