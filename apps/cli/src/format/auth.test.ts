import { expect, test } from 'bun:test'
import { formatGrantAdded } from './auth'

test('auth result reports the exact persisted provider and scopes', () => {
  expect(
    formatGrantAdded({
      grantId: 'grant-1',
      provider: 'google',
      scopes: ['email', 'mail.read', 'openid'],
    }),
  ).toBe(
    'auth grant added: grant-1\nprovider: google\nscopes: email, mail.read, openid',
  )
})
