import { auth, defineProvider, z } from '@ctxindex/extension-sdk'

export const googleOAuthProvider = defineProvider({
  id: 'google',
  auth: auth.oauth2({
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    identity: {
      url: 'https://openidconnect.googleapis.com/v1/userinfo',
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
      configSchema: z
        .object({
          clientId: z.string().min(1),
          clientSecret: z.string().min(1).optional(),
        })
        .strict(),
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
    fixedAuthorizationParams: {
      access_type: 'offline',
      include_granted_scopes: 'false',
      prompt: 'consent',
    },
  }),
})
