import {
  auth,
  defineAdapter,
  defineExtension,
  defineOAuthApp,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'

export const syntheticOAuthProvider = defineProvider({
  id: 'synthetic.oauth',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.synthetic.invalid/authorize',
    tokenUrl: 'https://auth.synthetic.invalid/token',
    identity: {
      url: 'https://api.synthetic.invalid/me',
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string().min(1) }).strict(),
      environment: { clientId: 'CTXINDEX_SYNTHETIC_CLIENT_ID' },
    },
    baseScopes: ['openid', 'shared.read'],
    allowedHosts: ['api.synthetic.invalid', 'auth.synthetic.invalid'],
  }),
})

const managedApp = defineOAuthApp(syntheticOAuthProvider, {
  label: 'managed',
  config: { clientId: 'synthetic-public-client-canary' },
})

const managedAdapter = defineAdapter({
  id: 'synthetic.managed',
  provider: syntheticOAuthProvider,
  access: { scopes: ['managed.read', 'shared.read'] },
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

const communityAdapter = defineAdapter({
  id: 'synthetic.community',
  provider: syntheticOAuthProvider,
  access: { scopes: ['community.read', 'shared.read'] },
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

export const managedOAuthExtension = defineExtension({
  id: 'fixture.managed-oauth',
  oauthApps: [managedApp],
  adapters: [managedAdapter],
})

export const communityOAuthExtension = defineExtension({
  id: 'fixture.community-oauth',
  adapters: [communityAdapter],
})
