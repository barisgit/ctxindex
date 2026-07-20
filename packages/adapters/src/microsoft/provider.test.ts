import { expect, test } from 'bun:test'
import { microsoftOAuthProvider } from './provider'

test('Microsoft provider supports common personal and organizational Accounts', () => {
  expect(microsoftOAuthProvider).toMatchObject({
    kind: 'provider',
    id: 'microsoft',
    auth: {
      kind: 'oauth2',
      authorizationUrl:
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      identity: {
        url: 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
        subjectPath: ['id'],
        labelPaths: [['displayName'], ['mail'], ['userPrincipalName']],
        identities: [
          { kind: 'email', path: ['mail'] },
          { kind: 'principal', path: ['userPrincipalName'] },
        ],
      },
      pkce: { method: 'S256', required: true },
      registration: {
        type: 'public',
        environment: { clientId: 'CTXINDEX_MICROSOFT_CLIENT_ID' },
      },
      baseScopes: ['openid', 'offline_access', 'User.Read'],
      allowedHosts: ['login.microsoftonline.com', 'graph.microsoft.com'],
      fixedAuthorizationParams: { prompt: 'select_account' },
    },
  })
  expect(
    microsoftOAuthProvider.auth.registration.configSchema.parse({
      clientId: 'byoa-client-id',
    }),
  ).toEqual({ clientId: 'byoa-client-id' })
  expect(
    microsoftOAuthProvider.auth.registration.configSchema.safeParse({
      clientId: '',
    }).success,
  ).toBe(false)
})
