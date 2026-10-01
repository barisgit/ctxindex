import { auth, defineProvider, z } from '@ctxindex/extension-sdk'

export const microsoftOAuthProvider = defineProvider({
  id: 'microsoft',
  auth: auth.oauth2({
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
      configSchema: z.object({ clientId: z.string().min(1) }).strict(),
      environment: { clientId: 'CTXINDEX_MICROSOFT_CLIENT_ID' },
    },
    baseScopes: ['openid', 'offline_access', 'User.Read'],
    allowedHosts: ['login.microsoftonline.com', 'graph.microsoft.com'],
    fixedAuthorizationParams: { prompt: 'select_account' },
  }),
})
