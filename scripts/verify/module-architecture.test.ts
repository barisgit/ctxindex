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
