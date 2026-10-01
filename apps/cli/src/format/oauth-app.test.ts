import { expect, test } from 'bun:test'
import {
  formatOAuthAppAdded,
  formatOAuthAppInventory,
  formatOAuthAppRemoved,
} from './oauth-app'

test('formats only safe OAuth App inventory fields', () => {
  const apps = [
    {
      providerId: 'google',
      label: 'official',
      origin: 'extension',
      provenance: {
        kind: 'extension',
        source: 'builtin',
        packageName: '@ctxindex/google',
      },
    },
  ] as const

  expect(formatOAuthAppInventory(apps, 'text')).toContain('official')
  expect(JSON.parse(formatOAuthAppInventory(apps, 'json'))).toEqual(apps)
  expect(formatOAuthAppInventory(apps, 'pretty')).not.toMatch(/secret|token/i)
})

test('formats OAuth App lifecycle confirmations', () => {
  expect(formatOAuthAppAdded('google', 'desktop')).toBe(
    'OAuth App added: google "desktop"',
  )
  expect(formatOAuthAppRemoved('google', 'desktop')).toBe(
    'OAuth App removed: google "desktop"',
  )
})
