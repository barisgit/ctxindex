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
  expect(result.stdout).toContain('README\t')
  expect(result.stdout).toContain('getting-started\t')
})

test('skills get returns bundled markdown', async () => {
  const result = await runCtxindex(['skills', 'get', 'getting-started'])

  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('# Getting started with ctxindex')
  expect(result.stdout).toContain('./reference/cli-overview.md')
})

test('skills get --inline merges referenced markdown', async () => {
  const result = await runCtxindex([
    'skills',
    'get',
    'getting-started',
    '--inline',
  ])

  expect(result.exitCode).toBe(0)
  expect(result.stderr).toBe('')
  expect(result.stdout).toContain('--- inlined: reference/cli-overview ---')
  expect(result.stdout).toContain('# CLI overview')
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

  expect(listJson.map((skill) => skill.name)).toContain('README')
  expect(listJson.map((skill) => skill.name)).toContain('getting-started')
  expect(getJson.name).toBe('getting-started')
  expect(getJson.content).toContain('# Getting started with ctxindex')
})
