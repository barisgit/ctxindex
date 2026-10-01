import * as sdk from '@ctxindex/extension-sdk'
import {
  type ActionContext,
  type AnyCatalogDefinition,
  type AnyExtensionDefinition,
  auth,
  defineAdapter,
  defineCatalog,
  defineExtension,
  defineOAuthApp,
  defineProfile,
  defineProvider,
  docs,
  packageExtension,
  type SyncContext,
  z,
} from '@ctxindex/extension-sdk'

const provider = defineProvider({
  id: 'fixture.provider',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    identity: {
      url: 'https://api.example.test/me',
      subjectPath: ['id'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string() }),
      environment: { clientId: 'CTXINDEX_FIXTURE_CLIENT_ID' },
    },
    baseScopes: ['openid'],
    allowedHosts: ['auth.example.test', 'api.example.test'],
  }),
})

const profile = defineProfile({
  id: 'fixture.note',
  version: 1,
  schema: z.object({ title: z.string(), body: z.string() }),
  search: {
    title: (value) => value.title,
    chunks: (value) => [value.body],
  },
})

const adapter = defineAdapter({
  id: 'fixture.adapter',
  provider,
  access: { scopes: ['notes.read'] },
  configSchema: z.object({}),
  profiles: [profile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

const oauthApp = defineOAuthApp(provider, {
  label: 'Fixture Desktop',
  config: { clientId: 'public-fixture-client-id' },
})

const extension: AnyExtensionDefinition = defineExtension({
  id: 'fixture.consumer',
  docs: docs('./docs'),
  providers: [provider],
  profiles: [profile],
  adapters: [adapter],
  oauthApps: [oauthApp],
})

const catalog: AnyCatalogDefinition = defineCatalog({
  id: 'fixture.catalog',
  label: 'Fixture Catalog',
  extensions: [
    extension,
    packageExtension(
      { kind: 'npm', target: '@fixture/another-extension@^1' },
      'fixture.another',
    ),
  ],
})

function acceptsContexts(
  _syncContext: SyncContext,
  _actionContext: ActionContext<{ readonly title: string }>,
): void {}
void acceptsContexts

console.log(
  JSON.stringify({
    extension: extension.id,
    catalog: catalog.id,
    runtimeExports: Object.keys(sdk).sort(),
    zod: z.string().safeParse('works').success,
  }),
)
