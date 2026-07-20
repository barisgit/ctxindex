import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

async function runCtxindex(args: string[]) {
  const process = Bun.spawn(
    ['bun', 'run', 'apps/cli/bin/ctxindex.mjs', ...args],
    {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  return { stdout, stderr, exitCode }
}

test('skills list shows bundled skills', async () => {
  const result = await runCtxindex(['skills', 'list'])

  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('getting-started\t')
  expect(result.stdout).not.toContain('reference/cli-overview\t')
  // README is directory documentation, not a bundled skill (SPEC §10c).
  expect(result.stdout).not.toContain('README\t')
})

test('skills get returns bundled markdown', async () => {
  const result = await runCtxindex(['skills', 'get', 'getting-started'])

  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('# Getting started with ctxindex')
  expect(result.stdout).toContain('ctxindex --help')
  expect(result.stdout).toContain(
    'ctxindex describe <profile|adapter|action> <id> --json',
  )
  expect(result.stdout).not.toContain('reference/cli-overview')
  expect(result.stdout).not.toContain('```')
  expect(result.stdout).not.toMatch(
    /^(?:\s*[-*+]\s+)?(?:init|realm|oauth-app|account|source)(?:\s|$|[/|])/m,
  )
})

test('skills get --inline preserves standalone orientation', async () => {
  const [normal, inline] = await Promise.all([
    runCtxindex(['skills', 'get', 'getting-started']),
    runCtxindex(['skills', 'get', 'getting-started', '--inline']),
  ])

  expect(inline.exitCode).toBe(0)
  expect(inline.stderr).toBe('')
  expect(inline.stdout).toBe(normal.stdout)
  expect(inline.stdout).not.toContain('--- inlined:')
})

test('skills path returns an existing directory', async () => {
  const result = await runCtxindex(['skills', 'path'])
  const path = result.stdout.trim()

  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(existsSync(path)).toBe(true)
})

test('skills --json output is parseable', async () => {
  const listResult = await runCtxindex(['skills', 'list', '--json'])
  const getResult = await runCtxindex([
    'skills',
    'get',
    'getting-started',
    '--json',
  ])

  expect(listResult.exitCode).toBe(0)
  expect(getResult.exitCode).toBe(0)

  const listJson = JSON.parse(listResult.stdout) as Array<{ name: string }>
  const getJson = JSON.parse(getResult.stdout) as {
    name: string
    content: string
  }

  expect(listJson.map((skill) => skill.name)).not.toContain('README')
  expect(listJson.map((skill) => skill.name)).toContain('getting-started')
  expect(getJson.name).toBe('getting-started')
  expect(getJson.content).toContain('# Getting started with ctxindex')
})
