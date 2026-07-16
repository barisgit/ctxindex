import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

/**
 * Red architecture contract for multi-provider-context-access.
 *
 * This file is intentionally named `.red.ts`, so the normal suite stays green
 * while the dependency-ordered slices make these assertions true. Run it
 * explicitly with:
 *
 *   bun test scripts/verify/multi-provider-architecture.red.ts
 *
 * Move each assertion into module-architecture.test.ts when its owning slice
 * turns green; delete this file after the final assertion moves.
 */

const repoRoot = new URL('../../', import.meta.url)
const adapterRoot = new URL('packages/adapters/src/', repoRoot)

function isProductionTypeScript(name: string): boolean {
  return (
    name.endsWith('.ts') &&
    !name.endsWith('.test.ts') &&
    !name.endsWith('.integration.test.ts') &&
    !name.endsWith('.e2e.test.ts')
  )
}

async function productionFiles(root: URL): Promise<URL[]> {
  const files: URL[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, root)
    if (entry.isDirectory()) files.push(...(await productionFiles(url)))
    else if (entry.isFile() && isProductionTypeScript(entry.name))
      files.push(url)
  }
  return files.sort((a, b) => (a.pathname < b.pathname ? -1 : 1))
}

async function sourceTree(root: URL): Promise<string> {
  return (
    await Promise.all(
      (await productionFiles(root)).map(async (url) => Bun.file(url).text()),
    )
  ).join('\n')
}

async function directoryNames(root: URL): Promise<string[]> {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

test('Microsoft provider behavior is owned by explicit Adapter modules', async () => {
  expect(await directoryNames(adapterRoot)).toContain('microsoft')
  expect(await directoryNames(new URL('microsoft/', adapterRoot))).toEqual([
    'calendar',
    'mailbox',
  ])

  const builtins = await Bun.file(new URL('builtins.ts', adapterRoot)).text()
  expect(builtins).toContain("from './microsoft/calendar/definition'")
  expect(builtins).toContain("from './microsoft/mailbox/definition'")
})

test('production Adapter surface has no send permission, Action, or route', async () => {
  const adapters = await sourceTree(adapterRoot)
  expect(adapters).not.toMatch(
    /Mail\.Send|gmail\.send|\/send(?:Mail)?\b|send-message/i,
  )
})
