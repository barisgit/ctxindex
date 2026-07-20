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

  expect(formatOAuthAppInventory(apps, false)).toBe(
    'google "official" origin=extension',
  )
  expect(JSON.parse(formatOAuthAppInventory(apps, true))).toEqual(apps)
  expect(formatOAuthAppInventory([], false)).toBe('No OAuth Apps available.')
})

test('formats OAuth App lifecycle confirmations', () => {
  expect(formatOAuthAppAdded('google', 'desktop')).toBe(
    'OAuth App added: google "desktop"',
  )
  expect(formatOAuthAppRemoved('google', 'desktop')).toBe(
    'OAuth App removed: google "desktop"',
  )
})
