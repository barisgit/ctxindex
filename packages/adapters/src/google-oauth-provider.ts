import type { OAuthProviderSpec } from '@ctxindex/extension-sdk'

export const googleOAuthProvider = {
  id: 'google',
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
  client: {
    type: 'public',
    secret: 'optional',
    tokenAuthMethod: 'client_secret_post',
  },
  baseScopes: ['openid', 'email'],
  environment: {
    clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
    clientSecret: 'CTXINDEX_GOOGLE_CLIENT_SECRET',
  },
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
} as const satisfies OAuthProviderSpec
