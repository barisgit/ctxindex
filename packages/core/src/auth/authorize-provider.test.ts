import { afterEach, expect, test } from 'bun:test'
import {
  type AnyAdapterDefinition,
  type AnyProviderDefinition,
  auth,
  defineAdapter,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'
import type { ResolvedOAuthApp } from '../oauth-app'
import type { CompleteRegistry } from '../registry'
import { authorizeProvider } from './authorize-provider'
import type { AddGrantInput, AuthService } from './types'

const provider = defineProvider({
  id: 'example',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example/authorize',
    tokenUrl: 'https://auth.example/token',
    identity: {
      url: 'https://api.example/me',
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [
        { kind: 'email', path: ['email'], verifiedPath: ['email_verified'] },
      ],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string() }),
      environment: { clientId: 'CTXINDEX_TEST_CLIENT_ID' },
    },
    baseScopes: ['openid'],
    allowedHosts: ['api.example', 'auth.example'],
  }),
})
const otherProvider = defineProvider({
  ...provider,
  id: 'other',
})

function adapter(
  id: string,
  owner: AnyProviderDefinition = provider,
  scopes = ['mail.read'],
): AnyAdapterDefinition {
  return defineAdapter({
    id,
    provider: owner,
    access: { scopes },
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
}

function registry(): CompleteRegistry {
  const adapters = [
    adapter('example.mail'),
    adapter('example.calendar', provider, ['calendar.read']),
    adapter('other.mail', otherProvider, ['other.read']),
  ]
  return {
    extensions: new Map(),
    providers: new Map<string, AnyProviderDefinition>([
      [provider.id, provider],
      [otherProvider.id, otherProvider],
    ]),
    oauthApps: new Map(),
    profiles: new Map(),
    adapters: new Map<string, AnyAdapterDefinition>(
      adapters.map((value) => [value.id, value]),
    ),
    provenances: new Map(),
  }
}

const app: ResolvedOAuthApp = {
  provider,
  label: 'desktop',
  config: { clientId: 'persisted-app-id' },
}
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('authorization selects one exact App and unions Provider and active Adapter scopes', async () => {
  let persisted: AddGrantInput | undefined
  const authService = {
    addGrant: async (input: AddGrantInput) => {
      persisted = input
      return { grantId: 'private', accountId: 'account' }
    },
  } as unknown as AuthService
  globalThis.fetch = (async (url: string | URL | Request) =>
    String(url).endsWith('/token')
      ? Response.json({ access_token: 'access', expires_in: 60 })
      : Response.json({
          sub: 'stable-subject',
          email: 'person@example.test',
          email_verified: true,
        })) as unknown as typeof fetch

  const result = await authorizeProvider(
    {
      provider: 'example',
      app: 'desktop',
      mode: 'from-env',
      label: 'Person',
    },
    {
      registry: registry(),
      authService,
      resolveApp: async (providerId, label) => {
        expect([providerId, label]).toEqual(['example', 'desktop'])
        return app
      },
      readEnvironment: (name) =>
        name === 'CTXINDEX_OAUTH_REFRESH_TOKEN'
          ? 'durable-refresh'
          : name === 'CTXINDEX_OAUTH_MOCK_BASE_URL'
            ? 'http://127.0.0.1:43123'
            : undefined,
      now: () => 1_000,
    },
  )

  expect(result.scopes).toEqual(['calendar.read', 'mail.read', 'openid'])
  expect(persisted?.appConfig).toEqual({ clientId: 'persisted-app-id' })
  expect(persisted?.account).toMatchObject({
    externalUserId: 'stable-subject',
    label: 'Person',
  })
})

test('unknown App label fails before environment reads, persistence, or egress', async () => {
  let environmentReads = 0
  let writes = 0
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    return Response.json({})
  }) as unknown as typeof fetch

  await expect(
    authorizeProvider(
      { provider: 'example', app: 'missing', mode: 'loopback' },
      {
        registry: registry(),
        authService: {
          addGrant: async () => {
            writes++
            return { grantId: 'private', accountId: 'account' }
          },
        } as unknown as AuthService,
        resolveApp: async () => {
          throw new Error('OAuth App is unavailable')
        },
        readEnvironment: () => {
          environmentReads++
          return undefined
        },
      },
    ),
  ).rejects.toThrow('OAuth App is unavailable')
  expect({ environmentReads, writes, requests }).toEqual({
    environmentReads: 0,
    writes: 0,
    requests: 0,
  })
})
