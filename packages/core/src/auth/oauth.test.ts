import { afterEach, expect, test } from 'bun:test'
import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import {
  fetchOAuthIdentity,
  postOAuthToken,
  resolveInitialGrantedScopes,
  resolveOAuthAppCredentials,
  resolveRefreshGrantedScopes,
} from './oauth'
import { testOAuthProvider } from './test-provider'

const provider = testOAuthProvider({
  authorizationUrl: 'https://accounts.example.test/authorize',
  tokenUrl: 'https://accounts.example.test/token',
})
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('token auth none never sends a client secret and redirects are manual', async () => {
  let init: RequestInit | undefined
  globalThis.fetch = (async (
    _url: string | URL | Request,
    value?: RequestInit,
  ) => {
    init = value
    return Response.json({ access_token: 'access', expires_in: 3600 })
  }) as unknown as typeof fetch
  const token = await postOAuthToken({
    provider,
    endpoint: 'http://127.0.0.1:43123/oauth/test/token',
    clientId: 'public-id',
    grant: { kind: 'refresh_token', refreshToken: 'refresh' },
  })
  expect(token.accessToken).toBe('access')
  expect(init?.redirect).toBe('manual')
  const body = new URLSearchParams(String(init?.body))
  expect(body.get('client_id')).toBe('public-id')
  expect(body.has('client_secret')).toBe(false)
})

test('provider host mismatch rejects before fetch', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return Response.json({})
  }) as unknown as typeof fetch
  await expect(
    postOAuthToken({
      provider,
      endpoint: 'https://evil.example/token',
      clientId: 'id',
      grant: { kind: 'refresh_token', refreshToken: 'refresh' },
    }),
  ).rejects.toMatchObject({ code: 'oauth_host_denied' })
  expect(calls).toBe(0)
})

test('missing persisted OAuth App config uses App vocabulary', () => {
  expect(() => resolveOAuthAppCredentials({})).toThrow()
  try {
    resolveOAuthAppCredentials({})
  } catch (error) {
    expect(error).toMatchObject({ code: 'missing_oauth_app_config' })
  }
})

test('declared identity paths use own properties and verified semantics', async () => {
  globalThis.fetch = (async () =>
    Response.json({
      sub: 'subject-1',
      email: 'person@example.test',
      email_verified: true,
    })) as unknown as typeof fetch
  const identity = await fetchOAuthIdentity({
    provider,
    endpoint: 'http://127.0.0.1:43123/oauth/test/identity',
    accessToken: 'token',
  })
  expect(identity).toEqual({
    externalUserId: 'subject-1',
    label: 'person@example.test',
    verifiedIdentities: [{ kind: 'email', value: 'person@example.test' }],
  })
})

test('scope response rules distinguish provider base scopes from operation scopes', () => {
  const selection = {
    provider: {
      ...provider,
      auth: {
        ...provider.auth,
        baseScopes: ['offline_access', 'openid'],
      },
    },
    operationScopes: ['Mail.Read'],
    requestedScopes: ['Mail.Read', 'offline_access', 'openid'],
  }
  expect(resolveInitialGrantedScopes(undefined, selection)).toEqual(
    selection.requestedScopes,
  )
  expect(resolveInitialGrantedScopes('Mail.Read', selection)).toEqual([
    'Mail.Read',
  ])
  expect(() => resolveInitialGrantedScopes('mail.read', selection)).toThrow()
  expect(
    resolveRefreshGrantedScopes(
      undefined,
      ['Mail.Read', 'openid'],
      selection.provider,
    ),
  ).toEqual(['Mail.Read', 'openid'])
  expect(
    resolveRefreshGrantedScopes(
      'Mail.Read',
      ['Mail.Read', 'openid'],
      selection.provider,
    ),
  ).toEqual(['Mail.Read'])
  expect(() =>
    resolveRefreshGrantedScopes(
      'openid',
      ['Mail.Read', 'openid'],
      selection.provider,
    ),
  ).toThrow()
})

test('verified identity false or missing skips while wrong type rejects', async () => {
  const declared = {
    ...provider,
    auth: {
      ...provider.auth,
      identity: {
        ...provider.auth.identity,
        identities: [
          {
            kind: 'email',
            path: ['email'] as ['email'],
            verifiedPath: ['verified'] as ['verified'],
          },
        ],
      },
    },
  } as OAuthProviderDefinition
  for (const body of [
    { sub: 's', email: 'e', verified: false },
    { sub: 's', email: 'e' },
  ]) {
    globalThis.fetch = (async () =>
      Response.json(body)) as unknown as typeof fetch
    await expect(
      fetchOAuthIdentity({
        provider: declared,
        endpoint: 'http://127.0.0.1:43123/oauth/test/identity',
        accessToken: 'token',
      }),
    ).resolves.toMatchObject({ verifiedIdentities: [] })
  }
  globalThis.fetch = (async () =>
    Response.json({
      sub: 's',
      email: 'e',
      verified: 'true',
    })) as unknown as typeof fetch
  await expect(
    fetchOAuthIdentity({
      provider: declared,
      endpoint: 'http://127.0.0.1:43123/oauth/test/identity',
      accessToken: 'token',
    }),
  ).rejects.toMatchObject({ code: 'identity_response_invalid' })
})
