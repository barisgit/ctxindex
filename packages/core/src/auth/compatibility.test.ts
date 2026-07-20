import { expect, test } from 'bun:test'
import { isGrantCompatible, providerIdForAuth } from './compatibility'

const binding = {
  provider: { id: 'google' },
  access: { scopes: ['mail.read'] },
} as const

test('Grant compatibility requires exact Provider and scope superset', () => {
  expect(providerIdForAuth(binding)).toBe('google')
  expect(
    isGrantCompatible(binding, {
      provider: 'google',
      scopes: ['openid', 'mail.read'],
    }),
  ).toBe(true)
  expect(
    isGrantCompatible(binding, { provider: 'google', scopes: ['openid'] }),
  ).toBe(false)
  expect(
    isGrantCompatible(binding, {
      provider: 'microsoft',
      scopes: ['mail.read'],
    }),
  ).toBe(false)
})

test('no-auth binding does not resolve a Provider identity', () => {
  expect(providerIdForAuth({ kind: 'none' })).toBeUndefined()
})
