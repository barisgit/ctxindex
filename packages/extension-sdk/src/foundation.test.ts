import { describe, expect, test } from 'bun:test'
import {
  type AnyAdapterDefinition,
  auth,
  defineAdapter,
  defineExtension,
  defineOAuthApp,
  defineProfile,
  defineProvider,
  type OAuth2Auth,
  type OAuth2RegistrationPolicy,
  type ProviderAuth,
  type ProviderDefinition,
  z,
} from './index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T

const oauthInput = {
  id: 'fixture.oauth',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    identity: {
      url: 'https://api.example.test/userinfo',
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [
        { kind: 'email', path: ['email'], verifiedPath: ['email_verified'] },
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
        clientId: 'CTXINDEX_FIXTURE_CLIENT_ID',
        clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
      },
    },
    baseScopes: ['openid', 'email'],
    allowedHosts: ['api.example.test', 'auth.example.test'],
  }),
} as const

const oauthProvider = defineProvider(oauthInput)
const localProvider = defineProvider({
  id: 'fixture.local',
  auth: auth.none(),
})
const noteProfile = defineProfile({
  id: 'fixture.note',
  version: 1,
  schema: z.object({ title: z.string() }),
  search: { title: (payload) => payload.title },
})

const authoredOAuthConfig = { clientId: 'client-id' }
const oauthAppInput = {
  label: 'primary',
  config: authoredOAuthConfig,
} as const
const oauthApp = defineOAuthApp(oauthProvider, oauthAppInput)
const authoredDateConfig = new Date('2026-07-19T00:00:00.000Z')
const dateProvider = defineProvider({
  id: 'fixture.date-oauth',
  auth: auth.oauth2({
    ...oauthInput.auth,
    registration: { type: 'public', configSchema: z.date(), environment: {} },
  }),
})
const dateOAuthApp = defineOAuthApp(dateProvider, {
  label: 'date-config',
  config: authoredDateConfig,
})

const oauthAdapter = defineAdapter({
  id: 'fixture.remote-notes',
  configSchema: z.object({}),
  provider: oauthProvider,
  access: { scopes: ['notes.read'] },
  profiles: [noteProfile],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: { searchRemote: async () => ({ resources: [], warnings: [] }) },
  actions: {},
})

const localAdapter = defineAdapter({
  id: 'fixture.local-notes',
  configSchema: z.object({}),
  provider: localProvider,
  profiles: [noteProfile],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {},
})

const providerlessAdapter = defineAdapter({
  id: 'fixture.providerless',
  configSchema: z.object({}),
  profiles: [noteProfile],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {},
})
const erasedProviderlessAdapter: AnyAdapterDefinition = providerlessAdapter
void erasedProviderlessAdapter

const emptyProviderlessAdapter = defineAdapter({
  id: 'fixture.empty-providerless',
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
const erasedEmptyProviderlessAdapter: AnyAdapterDefinition =
  emptyProviderlessAdapter
void erasedEmptyProviderlessAdapter

const widenedProvider: ProviderDefinition<
  'fixture.oauth',
  typeof oauthProvider.auth
> = oauthProvider
const widenedProviderAdapter = defineAdapter({
  id: 'fixture.widened-provider',
  configSchema: z.object({}),
  provider: widenedProvider,
  access: { scopes: ['runtime-validated.scope'] },
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

const extension = defineExtension({
  id: 'fixture.extension',
  providers: [oauthProvider, localProvider, dateProvider],
  profiles: [noteProfile],
  oauthApps: [oauthApp, dateOAuthApp],
  adapters: [
    oauthAdapter,
    localAdapter,
    providerlessAdapter,
    widenedProviderAdapter,
  ],
})
const emptyExtension = defineExtension({ id: 'fixture.empty' })

type _ProviderId = Assert<Equal<typeof oauthProvider.id, 'fixture.oauth'>>
type _ProviderAuth = Assert<Equal<typeof oauthProvider.auth.kind, 'oauth2'>>
type _ProviderEnvironment = Assert<
  Equal<
    typeof oauthProvider.auth.registration.environment.clientId,
    'CTXINDEX_FIXTURE_CLIENT_ID'
  >
>

const publicEnvironmentProvider = defineProvider({
  id: 'fixture.public-environment',
  auth: auth.oauth2({
    ...oauthInput.auth,
    registration: {
      ...oauthInput.auth.registration,
      environment: {
        clientId: 'GOOGLE_CLIENT_ID_2',
        clientSecret: '_GOOGLE_CLIENT_SECRET',
      },
    },
  }),
})
void publicEnvironmentProvider
type _PublicEnvironmentName = Assert<
  Equal<
    typeof publicEnvironmentProvider.auth.registration.environment.clientId,
    'GOOGLE_CLIENT_ID_2'
  >
>
type _ProfileIdentity = Assert<
  Equal<(typeof oauthAdapter.profiles)[0], typeof noteProfile>
>
type _ProviderIdentity = Assert<
  Equal<typeof oauthAdapter.provider, typeof oauthProvider>
>
type _OAuthScopes = Assert<
  Equal<typeof oauthAdapter.access.scopes, readonly ['notes.read']>
>
type _ProviderlessProvider = Assert<
  Equal<typeof providerlessAdapter.provider, undefined>
>
type _OAuthAppLabel = Assert<Equal<typeof oauthApp.label, 'primary'>>
type _OAuthAppConfig = Assert<
  Equal<typeof oauthApp.config, { clientId: string }>
>
type _ExtensionProvider = Assert<
  Equal<(typeof extension.providers)[0], typeof oauthProvider>
>

void (undefined as unknown as _ProviderId)
void (undefined as unknown as _ProviderAuth)
void (undefined as unknown as _ProviderEnvironment)
void (undefined as unknown as _PublicEnvironmentName)
void (undefined as unknown as _ProfileIdentity)
void (undefined as unknown as _ProviderIdentity)
void (undefined as unknown as _OAuthScopes)
void (undefined as unknown as _ProviderlessProvider)
void (undefined as unknown as _OAuthAppLabel)
void (undefined as unknown as _OAuthAppConfig)
void (undefined as unknown as _ExtensionProvider)

function assertRejectedSurfaces(): void {
  const configSchema = z.object({ clientId: z.string() })
  const validEnvironment = { clientId: 'FOO_BAR_2' } as const
  const validRegistration: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof validEnvironment
  > = {
    type: 'public',
    configSchema,
    environment: validEnvironment,
  }
  void validRegistration
  const validPretypedAuth = auth.oauth2({
    ...oauthInput.auth,
    registration: validRegistration,
  })
  type _ValidPretypedEnvironment = Assert<
    Equal<
      typeof validPretypedAuth.registration.environment.clientId,
      'FOO_BAR_2'
    >
  >
  void (undefined as unknown as _ValidPretypedEnvironment)
  const validSpreadAuth: OAuth2Auth<
    typeof configSchema,
    typeof validEnvironment
  > = { ...validPretypedAuth }
  const validProviderAuth: ProviderAuth<
    typeof configSchema,
    typeof validEnvironment
  > = validSpreadAuth
  void validProviderAuth

  const spreadBypass: OAuth2Auth<typeof configSchema, typeof validEnvironment> =
    {
      ...validPretypedAuth,
      registration: {
        ...validPretypedAuth.registration,
        environment: {
          // @ts-expect-error Spreading a branded OAuth2 auth cannot replace its validated mapping.
          clientId: 'FOO-BAR',
        },
      },
    }
  void spreadBypass

  const validSpreadProvider = defineProvider({
    id: 'fixture.valid-spread-provider',
    auth: { ...validPretypedAuth },
  })
  type _ValidSpreadProviderEnvironment = Assert<
    Equal<
      typeof validSpreadProvider.auth.registration.environment.clientId,
      'FOO_BAR_2'
    >
  >
  void (undefined as unknown as _ValidSpreadProviderEnvironment)

  defineProvider({
    id: 'fixture.spread-provider-bypass',
    // @ts-expect-error defineProvider cannot widen away an overridden invalid environment mapping.
    auth: {
      ...validPretypedAuth,
      registration: {
        ...validPretypedAuth.registration,
        environment: { clientId: 'FOO-BAR' },
      },
    },
  })

  const incompleteEnvironment: OAuth2RegistrationPolicy<
    typeof configSchema,
    // @ts-expect-error Environment mappings must include every config input key.
    Record<never, never>
  > = {
    type: 'public',
    configSchema,
    environment: {},
  }
  void incompleteEnvironment

  const unknownEnvironment = {
    clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
  } as const
  const invalidEnvironmentKey: OAuth2RegistrationPolicy<
    typeof configSchema,
    // @ts-expect-error Environment mappings are limited to config input keys.
    typeof unknownEnvironment
  > = {
    type: 'public',
    configSchema,
    environment: unknownEnvironment,
  }
  void invalidEnvironmentKey

  const invalidStartEnvironment = { clientId: '1GOOGLE_CLIENT_ID' } as const
  const invalidEnvironmentName: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof invalidStartEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names must start with an uppercase letter or underscore.
    environment: invalidStartEnvironment,
  }
  void invalidEnvironmentName

  const lowercaseEnvironment = { clientId: 'google_CLIENT_ID' } as const
  const lowercaseEnvironmentName: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof lowercaseEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names must be uppercase.
    environment: lowercaseEnvironment,
  }
  void lowercaseEnvironmentName

  const hyphenEnvironment = { clientId: 'FOO-BAR' } as const
  const hyphenRegistration: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof hyphenEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names cannot contain hyphens.
    environment: hyphenEnvironment,
  }
  void hyphenRegistration

  const punctuationEnvironment = { clientId: 'FOO.BAR' } as const
  const punctuationRegistration: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof punctuationEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names cannot contain punctuation.
    environment: punctuationEnvironment,
  }
  void punctuationRegistration

  const internalLowercaseEnvironment = { clientId: 'FOO_Bar' } as const
  const internalLowercaseRegistration: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof internalLowercaseEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names cannot contain lowercase letters.
    environment: internalLowercaseEnvironment,
  }
  void internalLowercaseRegistration

  const emptyEnvironment = { clientId: '' } as const
  const emptyRegistration: OAuth2RegistrationPolicy<
    typeof configSchema,
    typeof emptyEnvironment
  > = {
    type: 'public',
    configSchema,
    // @ts-expect-error Provider environment names cannot be empty.
    environment: emptyEnvironment,
  }
  void emptyRegistration

  const pretypedHyphenRegistration = {
    ...oauthInput.auth.registration,
    environment: {
      clientId: 'GOOGLE-CLIENT-ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
    },
  } as const
  auth.oauth2({
    ...oauthInput.auth,
    // @ts-expect-error Pretyped Provider environment names cannot contain hyphens.
    registration: pretypedHyphenRegistration,
  })

  const pretypedPunctuationRegistration = {
    ...oauthInput.auth.registration,
    environment: {
      clientId: 'GOOGLE.CLIENT.ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
    },
  } as const
  auth.oauth2({
    ...oauthInput.auth,
    // @ts-expect-error Pretyped Provider environment names cannot contain punctuation.
    registration: pretypedPunctuationRegistration,
  })

  const pretypedEmptyRegistration = {
    ...oauthInput.auth.registration,
    environment: {
      clientId: '',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
    },
  } as const
  auth.oauth2({
    ...oauthInput.auth,
    // @ts-expect-error Pretyped Provider environment names cannot be empty.
    registration: pretypedEmptyRegistration,
  })

  const pretypedLowercaseRegistration = {
    ...oauthInput.auth.registration,
    environment: {
      clientId: 'GOOGLE_Client_ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
    },
  } as const
  auth.oauth2({
    ...oauthInput.auth,
    // @ts-expect-error Pretyped Provider environment names cannot contain lowercase letters.
    registration: pretypedLowercaseRegistration,
  })

  // @ts-expect-error Provider definitions are versionless stable identities.
  defineProvider({ id: 'fixture.versioned', version: 1, auth: auth.none() })

  // @ts-expect-error Only proven OAuth2 and no-auth helpers are public.
  auth.apiKey({ label: 'token' })

  // @ts-expect-error OAuth adapters using an imported Provider require scopes.
  defineAdapter({
    id: 'fixture.missing-access',
    configSchema: z.object({}),
    provider: oauthProvider,
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  // @ts-expect-error Providerless Adapters cannot declare OAuth access.
  defineAdapter({
    id: 'fixture.invalid-providerless-access',
    configSchema: z.object({}),
    access: { scopes: ['invalid'] },
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  // @ts-expect-error Providerless Adapters cannot declare Provider API hosts.
  defineAdapter({
    id: 'fixture.invalid-providerless-hosts',
    configSchema: z.object({}),
    providerApiHosts: ['api.example.test'],
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  defineAdapter({
    id: 'fixture.invalid-none-access',
    configSchema: z.object({}),
    provider: localProvider,
    // @ts-expect-error No-auth Providers do not accept OAuth access scopes.
    access: { scopes: ['invalid'] },
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  defineOAuthApp(oauthProvider, {
    label: 'invalid',
    // @ts-expect-error OAuth App config is inferred from the Provider schema.
    config: { clientId: 42 },
  })

  // @ts-expect-error OAuth Apps require an imported OAuth2 Provider.
  defineOAuthApp(localProvider, { label: 'invalid-none', config: {} })

  defineOAuthApp(
    // @ts-expect-error OAuth Apps do not accept Provider reference shapes.
    { kind: 'provider-ref', id: 'fixture.unavailable' },
    { label: 'invalid-reference', config: {} },
  )

  defineAdapter({
    id: 'fixture.invalid-reference-bindings',
    configSchema: z.object({}),
    // @ts-expect-error Adapters require an imported Provider definition.
    provider: { kind: 'provider-ref', id: 'fixture.unavailable' },
    profiles: [
      // @ts-expect-error Adapters require imported Profile definitions.
      { kind: 'profile-ref', id: 'fixture.unavailable-note', version: 1 },
    ],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  defineAdapter({
    id: 'fixture.versioned-adapter',
    // @ts-expect-error Adapter definitions are stable id-only identities.
    version: 1,
    configSchema: z.object({}),
    provider: localProvider,
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })

  // @ts-expect-error Extension definitions are stable id-only identities.
  defineExtension({ id: 'fixture.versioned-extension', version: 1 })

  // @ts-expect-error Provider documentation belongs in deferred sidecars.
  defineProvider({ id: 'fixture.documented', auth: auth.none(), docs: {} })

  defineAdapter({
    id: 'fixture.documented-adapter',
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
    // @ts-expect-error Adapter documentation belongs in deferred sidecars.
    docs: { summary: 'Removed' },
  })

  defineExtension({
    id: 'fixture.documented-extension',
    // @ts-expect-error Extension documentation belongs in deferred sidecars.
    docs: { summary: 'Removed' },
  })

  defineProfile({
    id: 'fixture.documented-profile',
    version: 1,
    schema: z.object({ title: z.string() }),
    search: {
      fields: {
        title: {
          type: 'string',
          extract: (payload) => payload.title,
          // @ts-expect-error Profile field documentation belongs in sidecars.
          docs: 'Removed',
        },
      },
    },
    actions: {
      create: {
        effect: 'reversible',
        input: z.object({}),
        output: { id: 'fixture.documented-profile', version: 1 },
        // @ts-expect-error Profile Action documentation belongs in sidecars.
        docs: 'Removed',
      },
    },
    exports: {
      text: {
        mediaType: 'text/plain',
        render: () => '',
        // @ts-expect-error Profile export documentation belongs in sidecars.
        docs: 'Removed',
      },
    },
  })

  defineProfile({
    id: 'fixture.documented-profile-root',
    version: 1,
    schema: z.object({}),
    search: {},
    // @ts-expect-error Profile documentation belongs in deferred sidecars.
    docs: { summary: 'Removed' },
  })

  defineProfile({
    id: 'fixture.documented-action-examples',
    version: 1,
    schema: z.object({}),
    search: {},
    actions: {
      create: {
        effect: 'reversible',
        input: z.object({}),
        output: { id: 'fixture.documented-action-examples', version: 1 },
        // @ts-expect-error Profile Action examples belong in sidecars.
        examples: [{}],
      },
    },
  })
}
void assertRejectedSurfaces

describe('extension SDK foundation', () => {
  test('returns fresh discriminated plain definitions', () => {
    expect(oauthProvider).not.toBe(oauthInput)
    expect(oauthProvider.kind).toBe('provider')
    expect(noteProfile.kind).toBe('profile')
    expect(oauthApp.kind).toBe('oauth-app')
    expect(oauthAdapter.kind).toBe('adapter')
    expect(extension.kind).toBe('extension')
    expect(providerlessAdapter.provider).toBeUndefined()
    expect(providerlessAdapter.access).toBeUndefined()
    expect(providerlessAdapter.providerApiHosts).toBeUndefined()
    for (const value of [
      oauthProvider,
      localProvider,
      noteProfile,
      oauthApp,
      oauthAdapter,
      providerlessAdapter,
      extension,
    ]) {
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    }
  })

  test('normalizes omitted Extension collections without shared state', () => {
    const second = defineExtension({ id: 'fixture.second-empty' })
    expect(emptyExtension).toEqual({
      kind: 'extension',
      id: 'fixture.empty',
      providers: [],
      profiles: [],
      oauthApps: [],
      adapters: [],
    })
    expect(emptyExtension.providers).not.toBe(second.providers)
    expect(emptyExtension.profiles).not.toBe(second.profiles)
    expect(emptyExtension.oauthApps).not.toBe(second.oauthApps)
    expect(emptyExtension.adapters).not.toBe(second.adapters)
  })

  test('returns a fresh OAuth App without executing or cloning config', () => {
    expect(oauthApp).not.toBe(oauthAppInput)
    expect(oauthApp.config).toEqual({ clientId: 'client-id' })
    expect(oauthApp.config).toBe(authoredOAuthConfig)
    expect(dateOAuthApp.config).toBe(authoredDateConfig)
    expect(dateOAuthApp.config.toISOString()).toBe('2026-07-19T00:00:00.000Z')

    let transforms = 0
    const transformingProvider = defineProvider({
      id: 'fixture.transforming',
      auth: auth.oauth2({
        ...oauthInput.auth,
        registration: {
          type: 'public',
          configSchema: z
            .object({ clientId: z.string() })
            .transform((config) => {
              transforms += 1
              return { ...config, transformed: true }
            }),
          environment: { clientId: 'CTXINDEX_TRANSFORM_CLIENT_ID' },
        },
      }),
    })
    const app = defineOAuthApp(transformingProvider, {
      label: 'unparsed',
      config: { clientId: 'raw' },
    })

    expect(transforms).toBe(0)
    expect(app.config).toEqual({ clientId: 'raw' })
  })

  test('uses ordinary module values without host or instance machinery', async () => {
    const sources = await Promise.all(
      [
        'adapter.ts',
        'extension.ts',
        'index.ts',
        'oauth-app.ts',
        'profile.ts',
        'provider.ts',
      ].map((file) => Bun.file(`${import.meta.dir}/${file}`).text()),
    )
    const source = sources.join('\n')

    expect(source).not.toContain('ExtensionAuthoringHost')
    expect(source).not.toContain('globalThis')
    expect(source).not.toMatch(/\bdocs\b/)
    expect(source).not.toMatch(/\b(?:extensionRef|profileRef|providerRef)\b/)
    expect(source).not.toMatch(/\bclass\b/)
    expect(source).not.toMatch(/\binstanceof\b/)
  })
})
