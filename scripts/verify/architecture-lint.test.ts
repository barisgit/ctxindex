import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lintFiles } from './architecture-lint'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function makeTempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ctxindex-architecture-lint-'))
  tempDirs.push(dir)
  const path = join(dir, 'clean.ts')
  await writeFile(path, content)
  return path
}

test('thin sync command has no architecture violations', async () => {
  const violations = await lintFiles(['apps/cli/src/commands/sync.ts'])

  expect(violations).toEqual([])
})

test('init delegates retained database lifecycle outside commands', async () => {
  const violations = await lintFiles([
    'apps/cli/src/commands/init.ts',
    'apps/cli/src/direct-database.ts',
  ])

  expect(violations).toEqual([])
})

test('test fixtures may import commands and name provider URLs', async () => {
  const violations = await lintFiles([
    'apps/cli/src/commands/registry-interface.test.ts',
    'apps/cli/src/args/oauth-app.test.ts',
  ])

  expect(violations).toEqual([])
})

test('accepts a clean fixture', async () => {
  const cleanPath = await makeTempFile(`
import type { Database } from 'bun:sqlite'
import type { CtxindexConfig } from '@ctxindex/core/src/config'
import { z } from 'zod'

const schema = z.object({ name: z.string() })
const help = 'ctxindex sync runs configured providers'
const suppressedSql = 'SELECT 1' // noqa: architecture-lint

export function parseName(input: unknown): string {
  return schema.parse({ name: input }).name ?? help
}
`)

  const violations = await lintFiles([cleanPath])

  expect(violations).toHaveLength(0)
})

test('reports side-effect imports of banned modules', async () => {
  const path = await makeTempFile(`
import 'bun:sqlite'
`)

  const violations = await lintFiles([path])

  expect(violations.map((violation) => violation.rule)).toContain(
    'banned-import',
  )
})
