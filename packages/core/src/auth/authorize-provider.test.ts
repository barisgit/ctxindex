import { afterEach, expect, test } from 'bun:test'
import { defineAdapter } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createAdapterRegistry } from '../registry'
import { createProfileRegistry } from '../registry/profile-registry'
import { testOAuthProvider } from '../testing/oauth-provider'
import { authorizeProvider } from './authorize-provider'
import type { AddGrantInput, AuthService } from './types'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
const provider = {
  ...testOAuthProvider({
    id: 'example',
    authorizationUrl: 'https://auth.example/authorize',
    tokenUrl: 'https://auth.example/token',
  }),
  baseScopes: ['openid'],
}
const adapter = defineAdapter({
  id: 'example.mail',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'oauth2', provider, scopes: ['mail.read'] },
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
const calendarAdapter = defineAdapter({
  ...adapter,
  id: 'example.calendar',
  auth: { kind: 'oauth2', provider, scopes: ['calendar.read'] },
})
const otherProvider = testOAuthProvider({
  id: 'other',
  authorizationUrl: 'https://auth.other/authorize',
  tokenUrl: 'https://auth.other/token',
})
const otherAdapter = defineAdapter({
  ...adapter,
  id: 'other.mail',
  auth: { kind: 'oauth2', provider: otherProvider, scopes: ['other.read'] },
})
const registry = createAdapterRegistry(createProfileRegistry([]), [
  adapter,
  calendarAdapter,
  otherAdapter,
])
function environment(name: string): string | undefined {
  return (
    {
      TEST_CLIENT_ID: 'client',
      TEST_REFRESH_TOKEN: 'durable',
      CTXINDEX_OAUTH_MOCK_BASE_URL: 'http://127.0.0.1:43123',
    } as Record<string, string>
  )[name]
}

test('from-env stores all loaded provider scopes with a persisted client', async () => {
  let persisted: AddGrantInput | undefined
  const authService = {
    addGrant: async (input: AddGrantInput) => {
      persisted = input
      return { grantId: 'g', accountId: 'a' }
    },
  } as unknown as AuthService
  globalThis.fetch = (async (url: string | URL | Request) =>
    String(url).endsWith('/token')
      ? Response.json({ access_token: 'access', expires_in: 60 })
      : Response.json({
          sub: 'stable-subject',
          email: 'provider-label',
          email_verified: true,
        })) as unknown as typeof fetch
  const result = await authorizeProvider(
    {
      provider: 'example',
      mode: 'from-env',
      label: 'Override',
    },
    {
      registry,
      authService,
      resolveClient: async () => ({
        provider: 'example',
        label: 'default',
        clientId: 'persisted-client',
      }),
      readEnvironment: environment,
      now: () => 1000,
    },
  )
  expect(result.scopes).toEqual(['calendar.read', 'mail.read', 'openid'])
  expect(persisted?.account).toMatchObject({
    externalUserId: 'stable-subject',
    label: 'Override',
  })
  expect(persisted?.clientId).toBe('persisted-client')
  expect(persisted?.refreshToken).toBe('durable')
})

test('malformed provider subject reaches no persistence', async () => {
  let writes = 0
  const authService = {
    addGrant: async () => {
      writes++
      return { grantId: 'g', accountId: 'a' }
    },
  } as unknown as AuthService
  globalThis.fetch = (async (url: string | URL | Request) =>
    String(url).endsWith('/token')
      ? Response.json({ access_token: 'access', expires_in: 60 })
      : Response.json({
          email: 'provider-label',
          email_verified: true,
        })) as unknown as typeof fetch
  await expect(
    authorizeProvider(
      { provider: 'example', mode: 'from-env' },
      {
        registry,
        authService,
        resolveClient: async () => ({
          provider: 'example',
          label: 'default',
          clientId: 'persisted-client',
        }),
        readEnvironment: environment,
      },
    ),
  ).rejects.toMatchObject({ code: 'identity_response_invalid' })
  expect(writes).toBe(0)
})
