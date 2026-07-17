import { describe, expect, test } from 'bun:test'
import { defineAdapter, type OAuthProviderSpec } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createAdapterRegistry } from '../registry'
import { createProfileRegistry } from '../registry/profile-registry'
import { testOAuthProvider } from '../testing/oauth-provider'
import { resolveOAuthSelection, selectedOAuthScopes } from './selection'

const googleProvider = {
  ...testOAuthProvider({
    id: 'google',
    authorizationUrl: 'https://accounts.google.test/authorize',
    tokenUrl: 'https://accounts.google.test/token',
  }),
  baseScopes: ['openid', 'shared'],
}
const microsoftProvider = testOAuthProvider({
  id: 'microsoft',
  authorizationUrl: 'https://login.microsoft.test/authorize',
  tokenUrl: 'https://login.microsoft.test/token',
})

function adapter(
  id: string,
  provider: OAuthProviderSpec = googleProvider,
  scopes: readonly string[] = ['shared', 'mail'],
  version = 1,
) {
  return defineAdapter({
    id,
    version,
    configSchema: z.object({}),
    auth: { kind: 'oauth2', provider, scopes },
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
}

function nonOAuthAdapter(id: string) {
  return defineAdapter({
    id,
    version: 1,
    configSchema: z.object({}),
    auth: { kind: 'none' },
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
}

function registry(adapters: Parameters<typeof createAdapterRegistry>[1]) {
  return createAdapterRegistry(createProfileRegistry([]), adapters)
}

describe('selectedOAuthScopes', () => {
  test('returns deduplicated provider base scopes plus all loaded provider Adapter scopes', () => {
    const loaded = registry([
      adapter('google.mailbox'),
      adapter('google.calendar', googleProvider, ['calendar']),
      adapter('microsoft.mailbox', microsoftProvider, ['microsoft.mail']),
    ])

    expect(selectedOAuthScopes(loaded, 'google')).toEqual([
      'calendar',
      'mail',
      'openid',
      'shared',
    ])
  })

  test('rejects an unknown provider with a validation error', () => {
    const loaded = registry([adapter('google.mailbox')])
    expect(() => selectedOAuthScopes(loaded, 'missing')).toThrow()
    try {
      selectedOAuthScopes(loaded, 'missing')
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_oauth_selection' })
    }
  })
})

test('resolveOAuthSelection returns provider and separates all operation scopes from requested scopes', () => {
  const loaded = registry([
    adapter('google.mailbox', googleProvider, ['shared', 'mail.read']),
    adapter('google.calendar', googleProvider, ['calendar.read']),
    nonOAuthAdapter('local.directory'),
  ])
  expect(resolveOAuthSelection(loaded, 'google')).toEqual({
    provider: googleProvider,
    operationScopes: ['calendar.read', 'mail.read', 'shared'],
    requestedScopes: ['calendar.read', 'mail.read', 'openid', 'shared'],
  })
})
