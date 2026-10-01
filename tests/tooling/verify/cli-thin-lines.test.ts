import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import {
  countCommandLines,
  discoverProductionCommandFiles,
  findThinCommandViolations,
  maxCommandLines,
} from '../../../scripts/verify/cli-thin-lines'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

test('discovers every production command without a filename allowlist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-thin-commands-'))
  tempDirs.push(root)
  await Promise.all([
    writeFile(join(root, 'alpha.ts'), 'export const alpha = true\n'),
    writeFile(join(root, 'new-command.ts'), 'export const added = true\n'),
    writeFile(join(root, 'alpha.test.ts'), 'throw new Error()\n'),
    writeFile(join(root, 'README.md'), 'ignored\n'),
  ])

  expect(
    (await discoverProductionCommandFiles(root)).map((path) => basename(path)),
  ).toEqual(['alpha.ts', 'new-command.ts'])
})

test('ignores imports and blank lines but rejects one line over the budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-thin-command-size-'))
  tempDirs.push(root)
  const accepted = resolve(root, 'accepted.ts')
  const oversized = resolve(root, 'oversized.ts')
  const lines = Array.from(
    { length: maxCommandLines + 1 },
    (_, index) => `export const line${index} = ${index}`,
  )
  await Promise.all([
    writeFile(
      accepted,
      `import {\n  value,\n} from './dependency'\n\n${lines.slice(0, maxCommandLines).join('\n')}\n`,
    ),
    writeFile(oversized, `${lines.join('\n')}\n`),
  ])

  expect(countCommandLines(await Bun.file(accepted).text())).toBe(
    maxCommandLines,
  )
  expect(await findThinCommandViolations([accepted, oversized])).toEqual([
    { path: oversized, lineCount: maxCommandLines + 1 },
  ])
})

test('every discovered production command is within the budget', async () => {
  const files = await discoverProductionCommandFiles()

  expect(files.length).toBeGreaterThan(0)
  expect(await findThinCommandViolations(files)).toEqual([])
})
