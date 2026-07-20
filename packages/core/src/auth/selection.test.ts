import { expect, test } from 'bun:test'
import { auth, defineAdapter, defineProvider, z } from '@ctxindex/extension-sdk'
import type { CompleteRegistry } from '../registry'
import { resolveOAuthSelection } from './selection'

const provider = defineProvider({
  id: 'example',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example/authorize',
    tokenUrl: 'https://auth.example/token',
    identity: {
      url: 'https://api.example/me',
      subjectPath: ['id'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string() }),
      environment: { clientId: 'CTXINDEX_TEST_CLIENT_ID' },
    },
    baseScopes: ['profile', 'openid'],
    allowedHosts: ['api.example', 'auth.example'],
  }),
})

function registry(): CompleteRegistry {
  const adapters = [
    defineAdapter({
      id: 'example.mail',
      provider,
      access: { scopes: ['mail.read', 'profile'] },
      configSchema: z.object({}),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    }),
  ]
  return {
    extensions: new Map(),
    providers: new Map([[provider.id, provider]]),
    oauthApps: new Map(),
    profiles: new Map(),
    adapters: new Map(adapters.map((item) => [item.id, item])),
    provenances: new Map(),
  }
}

test('selection separates active Adapter scopes from sorted requested scopes', () => {
  expect(resolveOAuthSelection(registry(), 'example')).toEqual({
    provider,
    operationScopes: ['mail.read', 'profile'],
    requestedScopes: ['mail.read', 'openid', 'profile'],
  })
})

test('selection rejects absent and no-auth Providers', () => {
  expect(() => resolveOAuthSelection(registry(), 'missing')).toThrow(
    'Unknown OAuth provider',
  )
})
