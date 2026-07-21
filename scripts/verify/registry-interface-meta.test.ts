import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'

const requiredDiscoverySnippets = [
  'ctxindex --help',
  'ctxindex describe',
  'ctxindex describe <profile|adapter|action> <id> --json',
  'ctxindex extension list',
  'ctxindex skills list',
  'ctxindex skills get <name>',
] as const

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsRegistryInventory(prose: string, term: string): boolean {
  const escaped = escapeRegExp(term)
  const identifierBoundary = `(?<![A-Za-z0-9_.])${escaped}(?![A-Za-z0-9_.])`

  if (
    (term.includes('.') || /[A-Z]/.test(term)) &&
    new RegExp(identifierBoundary).test(prose)
  ) {
    return true
  }

  if (new RegExp(`\`[^\`\\n]*${identifierBoundary}[^\`\\n]*\``).test(prose)) {
    return true
  }

  return new RegExp(
    `^\\s*(?:(?:[-*+]\\s+|\\d+[.)]\\s+|#{1,6}\\s+|\\|\\s*))?` +
      `[\`'"]?${escaped}[\`'"]?\\s*(?::|\\||$)`,
    'm',
  ).test(prose)
}

test('legacy private registry vocabulary is removed from the public core', async () => {
  for (const path of [
    'packages/core/src/registry/types.ts',
    'packages/core/src/registry/registry-core.ts',
    'packages/core/src/registry/handle.ts',
  ])
    expect(await exists(path)).toBe(false)
  const index = await Bun.file('packages/core/src/registry/index.ts').text()
  expect(index).not.toMatch(/\.\/(types|registry-core|handle)'/)
})

test('workflow skills point to runtime vocabulary instead of declaring it', async () => {
  const prose = await Bun.file('skills/getting-started.md').text()
  const proseWithoutDiscovery = requiredDiscoverySnippets.reduce(
    (current, snippet) => current.replaceAll(snippet, ''),
    prose,
  )
  const forbidden = new Set<string>()
  for (const extension of CTXINDEX_BUILTIN_EXTENSIONS) {
    for (const profile of extension.profiles) {
      forbidden.add(profile.id)
      for (const alias of profile.docs?.aliases ?? []) forbidden.add(alias)
      for (const field of Object.keys(profile.search?.fields ?? {}))
        forbidden.add(field)
      for (const format of Object.keys(profile.exports ?? {}))
        forbidden.add(format)
      for (const action of Object.keys(profile.actions ?? {}))
        forbidden.add(action)
    }
  }
  for (const term of forbidden) {
    expect(containsRegistryInventory(proseWithoutDiscovery, term)).toBe(false)
  }
  expect(prose).toContain(
    'ctxindex describe <profile|adapter|action> <id> --json',
  )
  expect(prose).toContain('ctxindex --help')
  expect(prose).toContain('ctxindex describe')
  expect(prose).toContain('ctxindex extension list')
  expect(prose).toContain('ctxindex skills list')
  expect(prose).toContain('ctxindex skills get <name>')
  expect(prose).not.toContain('--config-root-path')
})

test('registry vocabulary guard catches identifiers without relying on backticks', () => {
  expect(
    containsRegistryInventory('communication.message', 'communication.message'),
  ).toBe(true)
  expect(containsRegistryInventory('- sender: message author', 'sender')).toBe(
    true,
  )
  expect(containsRegistryInventory('| unread | boolean |', 'unread')).toBe(true)
  expect(containsRegistryInventory('`organizer`', 'organizer')).toBe(true)
  expect(
    containsRegistryInventory('A sender can be useful context.', 'sender'),
  ).toBe(false)
})
