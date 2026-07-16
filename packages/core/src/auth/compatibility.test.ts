import { describe, expect, test } from 'bun:test'
import { testOAuthProvider } from '../testing/oauth-provider'
import {
  isGrantCompatible,
  normalizeGrantScopes,
  providerIdForAuth,
} from './compatibility'

const gmailAuth = {
  kind: 'oauth2',
  provider: testOAuthProvider({
    id: 'google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  }),
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
} as const

describe('OAuth Grant compatibility', () => {
  test('uses the directly declared provider identity', () => {
    expect(providerIdForAuth(gmailAuth)).toBe('google')
    expect(
      providerIdForAuth({
        ...gmailAuth,
        provider: {
          ...gmailAuth.provider,
          tokenUrl: 'http://localhost:9000/token',
        },
      }),
    ).toBe('google')
  })

  test('normalizes space-delimited and JSON-array Grant scopes', () => {
    expect(normalizeGrantScopes('scope:b scope:a scope:b')).toEqual([
      'scope:a',
      'scope:b',
    ])
    expect(normalizeGrantScopes('["scope:b","scope:a"]')).toEqual([
      'scope:a',
      'scope:b',
    ])
    expect(normalizeGrantScopes(['𐀀', '\uE000'])).toEqual(['\uE000', '𐀀'])
  })

  test('requires the same provider and a scope superset', () => {
    expect(
      isGrantCompatible(gmailAuth, {
        provider: 'google',
        scopes: JSON.stringify([
          'profile',
          'https://www.googleapis.com/auth/gmail.readonly',
        ]),
      }),
    ).toBe(true)
    expect(
      isGrantCompatible(gmailAuth, {
        provider: 'google',
        scopes: 'profile',
      }),
    ).toBe(false)
    expect(
      isGrantCompatible(gmailAuth, {
        provider: 'microsoft',
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
      }),
    ).toBe(false)
  })
})
