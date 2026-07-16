import type { OAuthProviderSpec } from '@ctxindex/extension-sdk'

export function testOAuthProvider(options: {
  readonly id?: string
  readonly authorizationUrl: string
  readonly tokenUrl: string
}): OAuthProviderSpec {
  const identityUrl = new URL('/userinfo', options.authorizationUrl).toString()
  return {
    id: options.id ?? 'test',
    authorizationUrl: options.authorizationUrl,
    tokenUrl: options.tokenUrl,
    identity: {
      url: identityUrl,
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    client: { type: 'public', secret: 'none', tokenAuthMethod: 'none' },
    baseScopes: ['openid'],
    environment: {
      clientId: 'TEST_CLIENT_ID',
      refreshToken: 'TEST_REFRESH_TOKEN',
    },
    allowedHosts: [
      ...new Set(
        [options.authorizationUrl, options.tokenUrl, identityUrl].map(
          (url) => new URL(url).hostname,
        ),
      ),
    ],
  }
}
