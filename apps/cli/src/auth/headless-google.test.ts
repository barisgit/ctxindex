import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { obtainGoogleTokens, resolveAddCreds } from './add-google'

let originalFetch: typeof fetch
let originalEnv: Record<string, string | undefined>

const gmailClientIdEnvKey = 'CTXINDEX_GMAIL_CLIENT_ID'
const gmailClientSecretEnvKey = 'CTXINDEX_GMAIL_CLIENT_SECRET'
const gmailRefreshTokenEnvKey = 'CTXINDEX_GMAIL_REFRESH_TOKEN'
const noBrowserEnvKey = 'CTXINDEX_NO_BROWSER'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  originalFetch = globalThis.fetch
  originalEnv = {
    CTXINDEX_GMAIL_CLIENT_ID: process.env[gmailClientIdEnvKey],
    CTXINDEX_GMAIL_CLIENT_SECRET: process.env[gmailClientSecretEnvKey],
    CTXINDEX_GMAIL_REFRESH_TOKEN: process.env[gmailRefreshTokenEnvKey],
    CTXINDEX_NO_BROWSER: process.env[noBrowserEnvKey],
  }
  delete process.env[gmailClientIdEnvKey]
  delete process.env[gmailClientSecretEnvKey]
  delete process.env[gmailRefreshTokenEnvKey]
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('headless google auth', () => {
  test('auth-code exchange returns tokens without browser fallback', async () => {
    const fetchedHosts: string[] = []
    globalThis.fetch = ((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const url = new URL(input.toString())
      fetchedHosts.push(url.hostname)
      expect(url.hostname).toBe('oauth2.googleapis.com')
      expect(init?.method).toBe('POST')
      expect(String(init?.body)).toContain('code=auth-code-1')
      return Promise.resolve(
        jsonResponse({
          access_token: 'access-token-secret',
          refresh_token: 'refresh-token-secret',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      )
    }) as unknown as typeof fetch

    const parsed = {
      kind: 'add' as const,
      provider: 'google',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      authCode: 'auth-code-1',
      loopback: false,
      fromEnv: false,
    }
    const creds = resolveAddCreds(parsed)
    const token = await obtainGoogleTokens(parsed, creds.id, creds.secret)

    expect(fetchedHosts).toEqual(['oauth2.googleapis.com'])
    expect(token.access_token).toBe('access-token-secret')
    expect(token.refresh_token).toBe('refresh-token-secret')
    expect(token.expires_at).toBeGreaterThan(Date.now())
  })

  test('missing auth-code inputs fail fast without network', async () => {
    globalThis.fetch = (() => {
      throw new Error('fetch should not be called')
    }) as unknown as typeof fetch

    expect(() =>
      resolveAddCreds({
        kind: 'add',
        provider: 'google',
        loopback: false,
        fromEnv: false,
      }),
    ).toThrow('requires --client-id and --client-secret')
  })
})
