import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENV_SCHEMA_KEYS } from './env-loader'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const envExamplePath = join(repoRoot, '.env.example')

interface EnvExampleEntry {
  readonly key: string
  readonly line: number
  readonly previousComment?: string
}

function parseEnvExample(text: string): EnvExampleEntry[] {
  const entries: EnvExampleEntry[] = []
  let previousNonEmpty: string | undefined

  for (const [index, line] of text.split('\n').entries()) {
    const trimmed = line.trim()
    const match = /^([A-Z][A-Z0-9_]*)=.*$/.exec(trimmed)
    if (match?.[1]) {
      entries.push({
        key: match[1],
        line: index + 1,
        ...(previousNonEmpty?.startsWith('#')
          ? { previousComment: previousNonEmpty }
          : {}),
      })
    }
    if (trimmed) previousNonEmpty = trimmed
  }

  return entries
}

async function readEntries(): Promise<EnvExampleEntry[]> {
  return parseEnvExample(await readFile(envExamplePath, 'utf8'))
}

test('drift between EnvSchema and .env.example fails both directions', async () => {
  const schemaKeys = ENV_SCHEMA_KEYS.filter((key) =>
    key.startsWith('CTXINDEX_'),
  ).sort()
  const exampleKeys = (await readEntries()).map((entry) => entry.key).sort()

  expect(exampleKeys).toEqual(schemaKeys)
})

test('every .env.example key has a comment', async () => {
  const uncommented = (await readEntries()).filter(
    (entry) => !entry.previousComment,
  )

  expect(uncommented).toEqual([])
})
