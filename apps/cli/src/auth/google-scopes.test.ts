import { describe, expect, test } from 'bun:test'
import type { ExtensionRegistry } from '@ctxindex/core/registry'
import { googleOAuthScopes } from './handle-auth-command'

function registryWithAuth(auth: readonly unknown[]): ExtensionRegistry {
  return {
    adapters: {
      list: () => auth.map((value) => ({ auth: value })),
    },
  } as unknown as ExtensionRegistry
}

describe('googleOAuthScopes', () => {
  test('derives sorted unique scopes from every loaded Google OAuth Adapter', () => {
    expect(
      googleOAuthScopes(
        registryWithAuth([
          {
            kind: 'oauth2',
            provider: {
              authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
              tokenUrl: 'https://oauth2.googleapis.com/token',
            },
            scopes: ['gmail.readonly', 'gmail.compose'],
          },
          {
            kind: 'oauth2',
            provider: {
              authUrl: 'https://accounts.google.com/authorize',
              tokenUrl: 'https://oauth2.googleapis.com/token',
            },
            scopes: ['gmail.compose', 'profile'],
          },
          { kind: 'none' },
        ]),
      ),
    ).toEqual(['gmail.compose', 'gmail.readonly', 'profile'])
  })

  test('errors when no Google OAuth Adapter is loaded', () => {
    expect(() =>
      googleOAuthScopes(registryWithAuth([{ kind: 'none' }])),
    ).toThrow('no Google OAuth Adapter is loaded')
  })
})
