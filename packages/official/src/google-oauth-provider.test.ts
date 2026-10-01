import { expect, test } from 'bun:test'
import { googleOAuthProvider } from './google-oauth-provider'

test('Google provider owns OAuth metadata and a strict BYOA registration schema', () => {
  expect(googleOAuthProvider).toMatchObject({
    kind: 'provider',
    id: 'google',
    auth: {
      kind: 'oauth2',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      registration: {
        type: 'public',
        environment: {
          clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
          clientSecret: 'CTXINDEX_GOOGLE_CLIENT_SECRET',
        },
      },
      baseScopes: ['openid', 'email'],
      allowedHosts: [
        'accounts.google.com',
        'oauth2.googleapis.com',
        'openidconnect.googleapis.com',
      ],
    },
  })
  expect(
    googleOAuthProvider.auth.registration.configSchema.parse({
      clientId: 'byoa-client-id',
    }),
  ).toEqual({ clientId: 'byoa-client-id' })
  expect(
    googleOAuthProvider.auth.registration.configSchema.parse({
      clientId: 'byoa-client-id',
      clientSecret: 'optional-secret',
    }),
  ).toEqual({
    clientId: 'byoa-client-id',
    clientSecret: 'optional-secret',
  })
  expect(
    googleOAuthProvider.auth.registration.configSchema.safeParse({
      clientId: 'byoa-client-id',
      unexpected: true,
    }).success,
  ).toBe(false)
  expect(JSON.stringify(googleOAuthProvider)).not.toContain('public-client-id')
})
