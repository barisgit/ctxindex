import { expect, test } from 'bun:test'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/official'

const requiredDiscoverySnippets = [
  'ctxindex --help',
  'ctxindex describe',
  'ctxindex describe <profile|adapter|action> <id> --format json',
  'ctxindex docs list --format json',
  'ctxindex docs search "<topic>" --format json',
  'ctxindex docs get <path>',
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

test('workflow skills point to runtime vocabulary instead of declaring it', async () => {
  const prose = await Bun.file('skills/ctxindex/SKILL.md').text()
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
    'ctxindex describe <profile|adapter|action> <id> --format json',
  )
  expect(prose).toContain('ctxindex --help')
  expect(prose).toContain('ctxindex describe')
  expect(prose).toContain('ctxindex docs list --format json')
  expect(prose).toContain('ctxindex docs search "<topic>" --format json')
  expect(prose).toContain('ctxindex docs get <path>')
  expect(prose).not.toContain('--config-root-path')
})

test('registry vocabulary guard catches identifiers without relying on backticks', () => {
  expect(containsRegistryInventory('mail.message', 'mail.message')).toBe(true)
  expect(containsRegistryInventory('- sender: message author', 'sender')).toBe(
    true,
  )
  expect(containsRegistryInventory('| unread | boolean |', 'unread')).toBe(true)
  expect(containsRegistryInventory('`organizer`', 'organizer')).toBe(true)
  expect(
    containsRegistryInventory('A sender can be useful context.', 'sender'),
  ).toBe(false)
})
