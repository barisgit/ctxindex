import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

const adapterRoot = new URL('../../packages/adapters/src/', import.meta.url)

function isProductionTypeScript(name: string): boolean {
  return name.endsWith('.ts') && !name.endsWith('.test.ts')
}

test('built-in Source Adapter implementation is owned by provider modules', async () => {
  const rootFiles = (await readdir(adapterRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(rootFiles).toEqual(['builtins.ts', 'index.ts'])

  const googleFiles = (await readdir(new URL('google-mailbox/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(googleFiles).toContain('config.ts')
  expect(googleFiles).toContain('definition.ts')

  const localFiles = (await readdir(new URL('local-directory/', adapterRoot)))
    .filter(isProductionTypeScript)
    .sort()
  expect(localFiles).toContain('definition.ts')
})

test('built-in Extension root composes definitions without owning Adapter behavior', async () => {
  const source = await Bun.file(new URL('builtins.ts', adapterRoot)).text()

  expect(source).toContain("from './google-mailbox/definition'")
  expect(source).toContain("from './local-directory/definition'")
  expect(source).not.toMatch(
    /defineAdapter|\bconfigSchema\b|\boperations\b|\bactions\b/,
  )
  expect(source).not.toContain("from 'zod'")
})

const sdkRoot = new URL('../../packages/extension-sdk/src/', import.meta.url)

test('public Extension SDK is a stable barrel over core-independent modules', async () => {
  const entries = await readdir(sdkRoot, { withFileTypes: true })
  const productionFiles = entries
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)
    .sort()

  expect(productionFiles).toEqual([
    'adapter.ts',
    'extension.ts',
    'index.ts',
    'operations.ts',
    'profile.ts',
    'reference.ts',
  ])

  for (const filename of productionFiles) {
    const source = await Bun.file(new URL(filename, sdkRoot)).text()
    expect(source).not.toContain('@ctxindex/core')
  }

  const publicIndex = await Bun.file(new URL('index.ts', sdkRoot)).text()
  expect(publicIndex).not.toMatch(/export (?:interface|function|class|const)\b/)
})

const formatRoot = new URL('../../apps/cli/src/format/', import.meta.url)

test('registry presentation is split behind a declaration-free facade', async () => {
  const productionFiles = (await readdir(formatRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isProductionTypeScript(entry.name))
    .map((entry) => entry.name)

  expect(productionFiles).toEqual(
    expect.arrayContaining([
      'registry-markdown.ts',
      'registry-projection.ts',
      'registry-schema.ts',
      'registry-text.ts',
      'registry.ts',
    ]),
  )

  const facade = await Bun.file(new URL('registry.ts', formatRoot)).text()
  expect(facade).not.toMatch(/^(?:export )?(?:async )?function\b/m)
  expect(facade.split('\n').length).toBeLessThanOrEqual(40)
})
