import { expect, test } from 'bun:test'
import { get } from 'node:http'
import { openOAuthLoopback } from './loopback'
import { testOAuthProvider } from './test-provider'

function request(url: string | URL): Promise<void> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      response.resume()
      response.on('end', resolve)
    }).on('error', reject)
  })
}

const provider = {
  ...testOAuthProvider({
    authorizationUrl: 'https://auth.test/authorize',
    tokenUrl: 'https://auth.test/token',
  }),
  auth: {
    ...testOAuthProvider({
      authorizationUrl: 'https://auth.test/authorize',
      tokenUrl: 'https://auth.test/token',
    }).auth,
    fixedAuthorizationParams: { access_type: 'offline', prompt: 'consent' },
  },
}

test('loopback uses PKCE, state, exact callback path, and fixed params', async () => {
  let authorizationUrl = ''
  let redirectHostname = ''
  let redirectPathname = ''
  const result = await openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: ['mail.read'],
    launchBrowser: async (value) => {
      authorizationUrl = value
      const url = new URL(value)
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('access_type')).toBe('offline')
      const redirectUri = url.searchParams.get('redirect_uri')
      if (!redirectUri) throw new Error('missing redirect URI')
      const callback = new URL(redirectUri)
      redirectHostname = callback.hostname
      redirectPathname = callback.pathname
      await request(new URL('/wrong', callback))
      await request(
        `${callback}?state=${url.searchParams.get('state')}&code=code-1`,
      )
    },
  })
  expect(result.code).toBe('code-1')
  expect(result.codeVerifier.length).toBeGreaterThan(20)
  expect(redirectHostname).toBe('localhost')
  expect(redirectPathname).toBe('/oauth/callback')
  expect(new URL(authorizationUrl).searchParams.get('response_type')).toBe(
    'code',
  )
})

test('no-browser emits URL and continues waiting; provider denial is precise', async () => {
  let emitted = ''
  const promise = openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl: (url) => {
      emitted = url
    },
  })
  while (!emitted) await Bun.sleep(1)
  const url = new URL(emitted)
  const callback = url.searchParams.get('redirect_uri')
  if (!callback) throw new Error('missing redirect URI')
  void request(
    `${callback}?state=${url.searchParams.get('state')}&error=access_denied`,
  ).catch(() => {})
  await expect(promise).rejects.toMatchObject({ code: 'authorization_denied' })
})

test('loopback times out and settles once', async () => {
  await expect(
    openOAuthLoopback({
      provider,
      authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
      clientId: 'client',
      scopes: [],
      timeoutMs: 5,
      noBrowser: true,
      emitAuthorizationUrl() {},
    }),
  ).rejects.toMatchObject({ code: 'loopback_timeout' })
})

test.each([
  ['state_mismatch', (_url: URL): string => 'state=wrong&code=code'],
  [
    'missing_code',
    (url: URL): string => `state=${url.searchParams.get('state')}`,
  ],
] as const)('loopback rejects %s precisely', async (code, query) => {
  let emitted = ''
  const promise = openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl: (url) => {
      emitted = url
    },
  })
  while (!emitted) await Bun.sleep(1)
  const url = new URL(emitted)
  const callback = url.searchParams.get('redirect_uri')
  if (!callback) throw new Error('missing redirect URI')
  void request(`${callback}?${query(url)}`).catch(() => {})
  await expect(promise).rejects.toMatchObject({ code })
})

test('loopback reports provider errors without echoing descriptions', async () => {
  let emitted = ''
  const promise = openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl: (url) => {
      emitted = url
    },
  })
  while (!emitted) await Bun.sleep(1)
  const url = new URL(emitted)
  const callback = url.searchParams.get('redirect_uri')
  if (!callback) throw new Error('missing redirect URI')
  void request(
    `${callback}?state=${url.searchParams.get('state')}&error=invalid_request&error_description=AADSTS9002325%3A+secret-detail`,
  ).catch(() => {})
  await expect(promise).rejects.toMatchObject({
    code: 'oauth_failed',
    message: 'OAuth authorization failed: invalid_request (AADSTS9002325)',
  })
})

test('browser launcher failure emits the URL and continues waiting', async () => {
  let emitted = ''
  await expect(
    openOAuthLoopback({
      provider,
      authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
      clientId: 'client',
      scopes: [],
      timeoutMs: 5,
      launchBrowser: async () => {
        throw new Error('no launcher')
      },
      emitAuthorizationUrl: (url) => {
        emitted = url
      },
    }),
  ).rejects.toMatchObject({ code: 'loopback_timeout' })
  expect(emitted).toContain('code_challenge_method=S256')
})

test('pasted redirect URL completes the same state-checked PKCE flow', async () => {
  const result = await openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl() {},
    readAuthorizationResponse: async ({ authorizationUrl, redirectUri }) => {
      const state = new URL(authorizationUrl).searchParams.get('state')
      return `${redirectUri}?state=${state}&code=pasted-code`
    },
  })

  expect(result.code).toBe('pasted-code')
})

test('bare pasted authorization code completes the PKCE flow', async () => {
  const result = await openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl() {},
    readAuthorizationResponse: async () => 'bare-code',
  })

  expect(result.code).toBe('bare-code')
})

test('pasted redirect rejects a foreign callback or mismatched state', async () => {
  await expect(
    openOAuthLoopback({
      provider,
      authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
      clientId: 'client',
      scopes: [],
      noBrowser: true,
      emitAuthorizationUrl() {},
      readAuthorizationResponse: async ({ redirectUri }) =>
        `${redirectUri}?state=wrong&code=pasted-code`,
    }),
  ).rejects.toMatchObject({ code: 'state_mismatch' })

  await expect(
    openOAuthLoopback({
      provider,
      authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
      clientId: 'client',
      scopes: [],
      noBrowser: true,
      emitAuthorizationUrl() {},
      readAuthorizationResponse: async ({ authorizationUrl }) =>
        `http://localhost:1/oauth/callback?state=${new URL(authorizationUrl).searchParams.get('state')}&code=pasted-code`,
    }),
  ).rejects.toMatchObject({
    code: 'oauth_failed',
    message: 'OAuth authorization failed: invalid_callback',
  })
})

test('abort closes a pending loopback immediately', async () => {
  const controller = new AbortController()
  const pending = openOAuthLoopback({
    provider,
    authorizationEndpoint: 'http://127.0.0.1/oauth/test/authorize',
    clientId: 'client',
    scopes: [],
    noBrowser: true,
    emitAuthorizationUrl() {
      controller.abort()
    },
    signal: controller.signal,
  })
  await expect(pending).rejects.toMatchObject({
    code: 'oauth_failed',
    message: 'OAuth authorization cancelled',
  })
})
