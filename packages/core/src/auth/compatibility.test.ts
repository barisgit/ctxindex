import { describe, expect, test } from 'bun:test'
import {
  isGrantCompatible,
  normalizeGrantScopes,
  providerKeyForAuth,
} from './compatibility'

const gmailAuth = {
  kind: 'oauth2',
  provider: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  },
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
} as const

describe('OAuth Grant compatibility', () => {
  test('derives Google identity from the canonical declared token host', () => {
    expect(providerKeyForAuth(gmailAuth)).toBe('google')
    expect(
      providerKeyForAuth({
        ...gmailAuth,
        provider: {
          ...gmailAuth.provider,
          tokenUrl: 'http://localhost:9000/token',
        },
      }),
    ).toBe('localhost')
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
