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

function registry(adapters: readonly ReturnType<typeof adapter>[]) {
  return createAdapterRegistry(createProfileRegistry([]), adapters)
}

describe('selectedOAuthScopes', () => {
  test('returns deduplicated provider base scopes plus only selected Adapter scopes', () => {
    const loaded = registry([
      adapter('google.mailbox'),
      adapter('google.calendar', googleProvider, ['calendar']),
    ])

    expect(selectedOAuthScopes(loaded, 'google', ['google.mailbox'])).toEqual([
      'mail',
      'openid',
      'shared',
    ])
  })

  test.each([
    ['empty', registry([adapter('google.mailbox')]), 'google', []],
    [
      'duplicate',
      registry([adapter('google.mailbox')]),
      'google',
      ['google.mailbox', 'google.mailbox'],
    ],
    [
      'unknown provider',
      registry([adapter('google.mailbox')]),
      'missing',
      ['google.mailbox'],
    ],
    [
      'unknown Adapter',
      registry([adapter('google.mailbox')]),
      'google',
      ['missing'],
    ],
    [
      'ambiguous Adapter version',
      registry([
        adapter('google.mailbox'),
        adapter('google.mailbox', googleProvider, ['mail'], 2),
      ]),
      'google',
      ['google.mailbox'],
    ],
    [
      'mixed provider',
      registry([
        adapter('google.mailbox'),
        adapter('microsoft.mailbox', microsoftProvider),
      ]),
      'google',
      ['google.mailbox', 'microsoft.mailbox'],
    ],
    [
      'non-OAuth Adapter',
      createAdapterRegistry(createProfileRegistry([]), [
        adapter('google.mailbox'),
        nonOAuthAdapter('local.directory'),
      ]),
      'google',
      ['local.directory'],
    ],
  ] as const)('rejects %s selection with a validation error', (_name, loaded, provider, adapterIds) => {
    expect(() => selectedOAuthScopes(loaded, provider, adapterIds)).toThrow()
    try {
      selectedOAuthScopes(loaded, provider, adapterIds)
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_oauth_selection' })
    }
  })
})

test('resolveOAuthSelection returns provider and separates selected operation scopes from requested scopes', () => {
  const loaded = registry([
    adapter('google.mailbox', googleProvider, ['shared', 'mail.read']),
  ])
  expect(resolveOAuthSelection(loaded, 'google', ['google.mailbox'])).toEqual({
    provider: googleProvider,
    operationScopes: ['mail.read', 'shared'],
    requestedScopes: ['mail.read', 'openid', 'shared'],
  })
})
