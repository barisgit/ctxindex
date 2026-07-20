import {
  auth,
  defineProvider,
  type OAuthProviderDefinition,
  z,
} from '@ctxindex/extension-sdk'

export function testOAuthProvider(
  overrides: {
    readonly id?: string
    readonly authorizationUrl?: string
    readonly tokenUrl?: string
  } = {},
): OAuthProviderDefinition {
  const authorizationUrl =
    overrides.authorizationUrl ?? 'https://auth.test/authorize'
  const tokenUrl = overrides.tokenUrl ?? 'https://auth.test/token'
  return defineProvider({
    id: overrides.id ?? 'test',
    auth: auth.oauth2({
      authorizationUrl,
      tokenUrl,
      identity: {
        url: 'https://api.test/me',
        subjectPath: ['sub'],
        labelPaths: [['email']],
        identities: [
          {
            kind: 'email',
            path: ['email'],
            verifiedPath: ['email_verified'],
          },
        ],
      },
      pkce: { method: 'S256', required: true },
      registration: {
        type: 'public',
        configSchema: z.object({
          clientId: z.string(),
          clientSecret: z.string().optional(),
        }),
        environment: {
          clientId: 'CTXINDEX_TEST_CLIENT_ID',
          clientSecret: 'CTXINDEX_TEST_CLIENT_SECRET',
        },
      },
      baseScopes: ['openid'],
      allowedHosts: [
        new URL(authorizationUrl).hostname,
        new URL(tokenUrl).hostname,
        'api.test',
      ].filter((value, index, values) => values.indexOf(value) === index),
    }),
  })
}
