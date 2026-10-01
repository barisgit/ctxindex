import { auth, defineAdapter, defineProvider, z } from '@ctxindex/extension-sdk'

// Loopback-free synthetic Provider: the activation journeys never authorize,
// they only need a Provider whose public OAuth App can collide.
export const activationProvider = defineProvider({
  id: 'fixture.activation',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.activation.invalid/authorize',
    tokenUrl: 'https://auth.activation.invalid/token',
    identity: {
      url: 'https://api.activation.invalid/me',
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string().min(1) }).strict(),
      environment: { clientId: 'CTXINDEX_FIXTURE_ACTIVATION_CLIENT_ID' },
    },
    baseScopes: ['openid'],
    allowedHosts: ['api.activation.invalid', 'auth.activation.invalid'],
  }),
})

export function activationAdapter(id: string) {
  return defineAdapter({
    id,
    provider: activationProvider,
    access: { scopes: ['activation.read'] },
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
}
