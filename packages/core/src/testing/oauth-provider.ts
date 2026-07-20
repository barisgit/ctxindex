import {
  auth,
  defineProvider,
  type OAuthProviderDefinition,
  z,
} from '@ctxindex/extension-sdk'

export function testOAuthProvider(options: {
  readonly id?: string
  readonly authorizationUrl: string
  readonly tokenUrl: string
}): OAuthProviderDefinition {
  const identityUrl = new URL('/userinfo', options.authorizationUrl).toString()
  return defineProvider({
    id: options.id ?? 'test',
    auth: auth.oauth2({
      authorizationUrl: options.authorizationUrl,
      tokenUrl: options.tokenUrl,
      identity: {
        url: identityUrl,
        subjectPath: ['sub'],
        labelPaths: [['email']],
        identities: [{ kind: 'email', path: ['email'] }],
      },
      pkce: { method: 'S256', required: true },
      registration: {
        type: 'public',
        configSchema: z.object({ clientId: z.string().min(1) }).strict(),
        environment: { clientId: 'CTXINDEX_TEST_CLIENT_ID' },
      },
      baseScopes: ['openid'],
      allowedHosts: [
        ...new Set(
          [options.authorizationUrl, options.tokenUrl, identityUrl].map(
            (url) => new URL(url).hostname,
          ),
        ),
      ],
    }),
  })
}
