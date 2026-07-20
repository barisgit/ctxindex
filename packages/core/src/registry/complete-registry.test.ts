import { describe, expect, test } from 'bun:test'
import type {
  AnyAdapterDefinition,
  AnyExtensionDefinition,
  AnyOAuthAppDefinition,
  AnyProfileDefinition,
  AnyProviderDefinition,
  OAuthProviderDefinition,
} from '@ctxindex/extension-sdk'
import { auth, defineProvider, z } from '@ctxindex/extension-sdk'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  collectExtensionGraph,
  type DefinitionProvenance,
} from './complete-registry'

function provenance(
  extensionId: string,
  entry = `${extensionId}.ts`,
  source: Pick<
    DefinitionProvenance,
    'packageName' | 'packageVersion' | 'integrity' | 'commit'
  > = {},
) {
  return {
    origin: 'explicit-path',
    entry,
    exportName: 'extension',
    ...source,
  } as const satisfies DefinitionProvenance
}

function collected(
  definition: AnyExtensionDefinition,
  entry?: string,
  source?: Pick<
    DefinitionProvenance,
    'packageName' | 'packageVersion' | 'integrity' | 'commit'
  >,
): CollectedExtension {
  return {
    definition,
    provenance: provenance(definition.id, entry, source),
  }
}

function profile(
  id = 'fixture.note',
  version = 1,
  schema: z.ZodTypeAny = z.object({ title: z.string() }),
): AnyProfileDefinition {
  return { kind: 'profile', id, version, schema }
}

function provider(id = 'fixture.provider'): AnyProviderDefinition {
  return { kind: 'provider', id, auth: { kind: 'none' } }
}

function oauthProvider(id = 'fixture.oauth'): OAuthProviderDefinition {
  return defineProvider({
    id,
    auth: auth.oauth2({
      authorizationUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      identity: {
        url: 'https://api.example.com/me',
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
      allowedHosts: ['api.example.com', 'auth.example.com'],
    }),
  })
}

function adapter(
  options: {
    readonly id?: string
    readonly provider?: AnyProviderDefinition
    readonly profiles?: readonly AnyProfileDefinition[]
    readonly access?: { readonly scopes: readonly string[] }
  } = {},
): AnyAdapterDefinition {
  return {
    kind: 'adapter',
    id: options.id ?? 'fixture.adapter',
    configSchema: z.object({}),
    ...(options.provider === undefined ? {} : { provider: options.provider }),
    ...(options.access === undefined ? {} : { access: options.access }),
    profiles: options.profiles ?? [],
    routing: 'indexed',
    capabilities: ['retrieve'],
    operations: { retrieve: async () => {} },
    actions: {},
  } as AnyAdapterDefinition
}

function extension(
  id: string,
  leaves: {
    readonly providers?: readonly AnyProviderDefinition[]
    readonly oauthApps?: readonly AnyOAuthAppDefinition[]
    readonly profiles?: readonly AnyProfileDefinition[]
    readonly adapters?: readonly AnyAdapterDefinition[]
  } = {},
): AnyExtensionDefinition {
  return {
    kind: 'extension',
    id,
    providers: leaves.providers ?? [],
    oauthApps: leaves.oauthApps ?? [],
    profiles: leaves.profiles ?? [],
    adapters: leaves.adapters ?? [],
  } as AnyExtensionDefinition
}

function build(roots: readonly CollectedExtension[]) {
  return buildCompleteCandidateRegistry({
    roots,
    localOAuthAppIdentities: [],
  })
}

describe('buildCompleteCandidateRegistry', () => {
  test('exposes deterministic reachable graph collection with provenance', () => {
    const note = profile()
    const local = provider()
    const root = extension('fixture.graph', {
      adapters: [adapter({ provider: local, profiles: [note] })],
    })
    const rootProvenance = provenance(root.id)

    expect(collectExtensionGraph(root, rootProvenance)).toMatchObject({
      extension: root,
      adapters: [{ id: 'fixture.adapter' }],
      providers: [{ id: 'fixture.provider' }],
      profiles: [{ id: 'fixture.note', version: 1 }],
      provenance: rootProvenance,
    })
  })

  test('builds from supplied roots without installing a foundational Profiles root', () => {
    const note = profile()
    const local = provider()
    const notes = adapter({ provider: local, profiles: [note] })
    const registry = build([
      collected(extension('fixture.integration', { adapters: [notes] })),
    ])

    expect([...registry.extensions.keys()]).toEqual(['fixture.integration'])
    expect([...registry.providers.keys()]).toEqual(['fixture.provider'])
    expect([...registry.profiles.keys()]).toEqual(['fixture.note@1'])
    expect([...registry.adapters.keys()]).toEqual(['fixture.adapter'])
  })

  test('coalesces Google/Microsoft-style imported canonical Profile copies', () => {
    const canonicalProfile = profile()

    const registry = build([
      collected(
        extension('google.calendar', {
          adapters: [
            adapter({
              id: 'google.calendar',
              provider: provider('google'),
              profiles: [canonicalProfile],
            }),
          ],
        }),
        'google.ts',
      ),
      collected(
        extension('microsoft.calendar', {
          adapters: [
            adapter({
              id: 'microsoft.calendar',
              provider: provider('microsoft'),
              profiles: [canonicalProfile],
            }),
          ],
        }),
        'microsoft.ts',
      ),
    ])

    expect([...registry.profiles.keys()]).toEqual(['fixture.note@1'])
    expect(registry.provenances.get('profile:fixture.note@1')).toHaveLength(2)
  })

  test('accepts a providerless Adapter and registers no Provider', () => {
    const registry = build([
      collected(
        extension('fixture.local', {
          adapters: [adapter({ profiles: [profile()] })],
        }),
      ),
    ])

    expect(registry.providers.size).toBe(0)
    expect(registry.adapters.has('fixture.adapter')).toBe(true)
    expect(registry.profiles.has('fixture.note@1')).toBe(true)
  })

  test('forbids auth, account, and access bindings on a providerless Adapter', () => {
    for (const forbidden of [
      { access: { scopes: ['fixture.read'] } },
      { auth: { kind: 'none' } },
      { account: { required: true } },
    ]) {
      const invalid = { ...adapter(), ...forbidden } as AnyAdapterDefinition
      expect(() =>
        build([
          collected(
            extension('fixture.invalid-providerless', {
              adapters: [invalid],
            }),
          ),
        ]),
      ).toThrow('Providerless Adapter fixture.adapter')
    }
  })

  test('forbids Provider API hosts on a providerless Adapter', () => {
    const invalid = {
      ...adapter(),
      providerApiHosts: ['api.example.com'],
    } as AnyAdapterDefinition

    expect(() =>
      build([
        collected(
          extension('fixture.invalid-providerless-hosts', {
            adapters: [invalid],
          }),
        ),
      ]),
    ).toThrow('Providerless Adapter fixture.adapter')
  })

  test('rejects malformed Adapter routing, capabilities, and operations', () => {
    const malformed = [
      { routing: 'remote' },
      { capabilities: ['retrieve', 'unknown'] },
      { operations: { retrieve: 'not-a-function' } },
      { operations: { retrieve: async () => {}, unknown: async () => {} } },
    ]

    for (const fields of malformed) {
      const invalid = { ...adapter(), ...fields } as AnyAdapterDefinition
      expect(() =>
        build([
          collected(
            extension('fixture.malformed-executable-adapter', {
              adapters: [invalid],
            }),
          ),
        ]),
      ).toThrow('Invalid Adapter definition')
    }
  })

  test('rejects malformed Adapter Action bindings', () => {
    for (const actions of [
      [],
      { 'fixture.create': null },
      {
        'fixture.create': {
          profile: profile(),
          input: z.object({}),
          output: profile('fixture.output'),
          run: 'not-a-function',
        },
      },
    ]) {
      const invalid = {
        ...adapter(),
        actions,
      } as unknown as AnyAdapterDefinition
      expect(() =>
        build([
          collected(
            extension('fixture.malformed-action-adapter', {
              adapters: [invalid],
            }),
          ),
        ]),
      ).toThrow('Invalid Adapter definition')
    }
  })

  test('rejects malformed Provider access and API hosts', () => {
    const oauth = oauthProvider()
    const base = adapter({
      provider: oauth,
      access: { scopes: ['fixture.read'] },
    })
    const malformed = [
      { access: null },
      { access: { scopes: 'fixture.read' } },
      { access: { scopes: ['fixture.read'], unknown: true } },
      { providerApiHosts: 'api.example.com' },
      { providerApiHosts: ['https://api.example.com'] },
      { providerApiHosts: ['API.EXAMPLE.COM'] },
      { providerApiHosts: ['api.example.com', 'api.example.com'] },
    ]

    for (const fields of malformed) {
      const invalid = { ...base, ...fields } as AnyAdapterDefinition
      expect(() =>
        build([
          collected(
            extension('fixture.malformed-provider-adapter', {
              adapters: [invalid],
            }),
          ),
        ]),
      ).toThrow('Invalid Adapter definition')
    }
  })

  test('coalesces the same exact imported Provider through multiple roots', () => {
    const firstProvider = provider()
    const secondProvider = provider()
    expect(firstProvider).not.toBe(secondProvider)

    const registry = build([
      collected(
        extension('fixture.first', {
          adapters: [adapter({ id: 'fixture.first', provider: firstProvider })],
        }),
        'first.ts',
      ),
      collected(
        extension('fixture.second', {
          adapters: [
            adapter({ id: 'fixture.second', provider: secondProvider }),
          ],
        }),
        'second.ts',
      ),
    ])

    expect([...registry.providers.keys()]).toEqual(['fixture.provider'])
    expect(registry.provenances.get('provider:fixture.provider')).toHaveLength(
      2,
    )
  })

  test('coalesces exact reused Adapter and Extension objects with all provenance', () => {
    const sharedAdapter = adapter({
      provider: provider(),
      profiles: [profile()],
    })
    const sharedExtension = extension('fixture.duplicate-extension', {
      adapters: [sharedAdapter],
    })

    const registry = build([
      collected(sharedExtension, '/first-copy/extension.ts', {
        packageName: 'fixture-copy',
        integrity: 'sha512-identical',
      }),
      collected(sharedExtension, '/second-copy/extension.ts', {
        packageName: 'fixture-copy',
        integrity: 'sha512-identical',
      }),
    ])

    expect([...registry.extensions.keys()]).toEqual([
      'fixture.duplicate-extension',
    ])
    expect([...registry.adapters.keys()]).toEqual(['fixture.adapter'])
    expect(
      registry.provenances.get('extension:fixture.duplicate-extension'),
    ).toHaveLength(2)
    expect(registry.provenances.get('adapter:fixture.adapter')).toHaveLength(2)
  })

  test('rejects the same exact OAuth App root exported under multiple provenances', () => {
    const oauth = oauthProvider()
    const app = {
      kind: 'oauth-app',
      provider: oauth,
      label: 'desktop',
      config: { clientId: 'public-client' },
    } as const satisfies AnyOAuthAppDefinition
    const sharedExtension = extension('fixture.duplicate-app-extension', {
      oauthApps: [app],
    })

    expect(() =>
      build([
        collected(sharedExtension, '/package/extension.ts'),
        {
          definition: sharedExtension,
          provenance: {
            ...provenance(sharedExtension.id, '/package/extension.ts'),
            exportName: 'secondaryExtension',
          },
        },
      ]),
    ).toThrow('Duplicate OAuth App')
  })

  test('rejects conflicting reachable Providers in both root orders', () => {
    const first = collected(
      extension('fixture.first', {
        adapters: [adapter({ provider: provider() })],
      }),
    )
    const second = collected(
      extension('fixture.second', {
        adapters: [
          adapter({
            id: 'fixture.second-adapter',
            provider: oauthProvider('fixture.provider'),
            access: { scopes: ['fixture.read'] },
          }),
        ],
      }),
    )

    for (const roots of [
      [first, second],
      [second, first],
    ]) {
      expect(() => build(roots)).toThrow(
        'Conflicting Provider fixture.provider',
      )
    }
  })

  test('rejects unprovable executable equivalence even when function strings match', () => {
    const executableAdapter = (captured: string) => {
      const retrieve = async () => {
        void captured
      }
      return { ...adapter(), operations: { retrieve } }
    }
    const first = collected(
      extension('fixture.first-executable', {
        adapters: [executableAdapter('first')],
      }),
      'first-executable.ts',
      {
        packageName: 'fixture-copy',
        packageVersion: '1.0.0',
        integrity: 'sha512-same-root-package',
      },
    )
    const second = collected(
      extension('fixture.second-executable', {
        adapters: [executableAdapter('second')],
      }),
      'second-executable.ts',
      {
        packageName: 'fixture-copy',
        packageVersion: '1.0.0',
        integrity: 'sha512-same-root-package',
      },
    )

    for (const roots of [
      [first, second],
      [second, first],
    ]) {
      expect(() => build(roots)).toThrow('Conflicting Adapter fixture.adapter')
    }
  })

  test('rejects conflicting canonical Profile copies in both root orders', () => {
    const first = collected(
      extension('fixture.first-profile', {
        profiles: [profile()],
      }),
    )
    const second = collected(
      extension('fixture.second-profile', {
        profiles: [profile('fixture.note', 1, z.object({ title: z.number() }))],
      }),
    )

    for (const roots of [
      [first, second],
      [second, first],
    ]) {
      expect(() => build(roots)).toThrow('Conflicting Profile fixture.note@1')
    }
  })

  test('rejects distinct schema-bearing copies despite matching root package provenance', () => {
    const first = collected(
      extension('fixture.first-schema-copy', {
        profiles: [profile()],
      }),
      '/first-copy/extension.ts',
      { packageName: 'fixture-copy', integrity: 'sha512-identical' },
    )
    const second = collected(
      extension('fixture.second-schema-copy', {
        profiles: [profile()],
      }),
      '/second-copy/extension.ts',
      { packageName: 'fixture-copy', integrity: 'sha512-identical' },
    )

    for (const roots of [
      [first, second],
      [second, first],
    ]) {
      expect(() => build(roots)).toThrow('Conflicting Profile fixture.note@1')
    }
  })

  test('collects standalone leaves and transitive Adapter leaves with root provenance', () => {
    const standaloneProfile = profile('fixture.standalone')
    const nestedProfile = profile('fixture.nested')
    const standaloneProvider = provider('fixture.standalone-provider')
    const nestedProvider = provider('fixture.nested-provider')
    const registry = build([
      collected(
        extension('fixture.mixed', {
          providers: [standaloneProvider],
          profiles: [standaloneProfile],
          adapters: [
            adapter({
              provider: nestedProvider,
              profiles: [nestedProfile],
            }),
          ],
        }),
      ),
    ])

    expect([...registry.providers.keys()]).toEqual([
      'fixture.nested-provider',
      'fixture.standalone-provider',
    ])
    expect([...registry.profiles.keys()]).toEqual([
      'fixture.nested@1',
      'fixture.standalone@1',
    ])
    expect(
      registry.provenances.get('provider:fixture.nested-provider'),
    ).toEqual([provenance('fixture.mixed')])
  })

  test('collects an OAuth App imported Provider transitively', () => {
    const oauth = oauthProvider()
    const app = {
      kind: 'oauth-app',
      provider: oauth,
      label: 'desktop',
      config: { clientId: 'public-client' },
    } as const satisfies AnyOAuthAppDefinition
    const registry = build([
      collected(extension('fixture.oauth-root', { oauthApps: [app] })),
    ])

    expect(registry.providers.get('fixture.oauth')).toEqual(oauth)
    expect(registry.oauthApps.size).toBe(1)
    expect(registry.provenances.get('provider:fixture.oauth')).toEqual([
      provenance('fixture.oauth-root'),
    ])
  })

  test('always rejects a repeated OAuth App identity, including exact reuse', () => {
    const oauth = oauthProvider()
    const app = {
      kind: 'oauth-app',
      provider: oauth,
      label: 'desktop',
      config: { clientId: 'public-client' },
    } as const satisfies AnyOAuthAppDefinition
    const first = collected(
      extension('fixture.first-app', { oauthApps: [app] }),
    )
    const second = collected(
      extension('fixture.second-app', { oauthApps: [app] }),
    )

    for (const roots of [
      [first, second],
      [second, first],
    ]) {
      expect(() => build(roots)).toThrow('Duplicate OAuth App')
    }
  })

  test('enforces OAuth App Provider policy, label, and config validation', () => {
    const publicProvider = oauthProvider()
    const confidentialProvider = {
      ...publicProvider,
      auth: {
        ...publicProvider.auth,
        registration: {
          ...publicProvider.auth.registration,
          type: 'confidential',
        },
      },
    } as OAuthProviderDefinition
    const app = (
      appProvider: AnyProviderDefinition,
      label: string,
      config: unknown,
    ) =>
      ({
        kind: 'oauth-app',
        provider: appProvider,
        label,
        config,
      }) as unknown as AnyOAuthAppDefinition
    const candidate = (definition: AnyOAuthAppDefinition) =>
      build([
        collected(extension('fixture.policy-app', { oauthApps: [definition] })),
      ])

    expect(() => candidate(app(provider(), 'desktop', {}))).toThrow(
      'requires an OAuth2 Provider',
    )
    expect(() =>
      candidate(app(confidentialProvider, 'desktop', { clientId: 'client' })),
    ).toThrow('requires public Provider registration')
    expect(() => candidate(app(publicProvider, '   ', {}))).toThrow(
      'OAuth App label must not be blank',
    )
    expect(() => candidate(app(publicProvider, 'desktop', {}))).toThrow(
      'Invalid OAuth App config',
    )

    const nativeProvider = {
      ...publicProvider,
      auth: {
        ...publicProvider.auth,
        registration: {
          type: 'public',
          configSchema: z
            .object({
              clientId: z.string(),
              clientSecret: z.string(),
            })
            .strict(),
          environment: {
            clientId: 'CTXINDEX_FIXTURE_CLIENT_ID',
            clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
          },
        },
      },
    } as OAuthProviderDefinition
    expect(
      candidate(
        app(nativeProvider, 'native', {
          clientId: 'public-client',
          clientSecret: 'provider-issued-desktop-metadata',
        }),
      ).oauthApps.size,
    ).toBe(1)
  })

  test('recursively rejects typed secret references from Extension OAuth App config', () => {
    const publicProvider = {
      ...oauthProvider(),
      auth: {
        ...oauthProvider().auth,
        registration: {
          type: 'public',
          configSchema: z.object({
            clientId: z.string(),
            metadata: z.object({ values: z.array(z.string()) }),
          }),
          environment: {
            clientId: 'GOOGLE_CLIENT_ID',
            metadata: 'GOOGLE_METADATA',
          },
        },
      },
    } as OAuthProviderDefinition
    const candidate = (value: string) =>
      build([
        collected(
          extension('fixture.secret-reference-app', {
            oauthApps: [
              {
                kind: 'oauth-app',
                provider: publicProvider,
                label: 'desktop',
                config: {
                  clientId: 'public-client',
                  metadata: { values: ['public-metadata', value] },
                },
              },
            ],
          }),
        ),
      ])

    for (const reference of [
      'keychain:ctxindex/app/client-id',
      'file:secrets.box#app/client-id',
      'env:GOOGLE_CLIENT_ID',
      'env://GOOGLE_CLIENT_ID',
    ]) {
      expect(() => candidate(reference)).toThrow(
        'Invalid OAuth App config for Provider "fixture.oauth", label "desktop"',
      )
    }

    expect(candidate('provider-issued-desktop-secret').oauthApps.size).toBe(1)
  })

  test('rejects malformed OAuth2 Provider security metadata', () => {
    const valid = oauthProvider()
    const invalidProviders = [
      {
        ...valid,
        auth: { ...valid.auth, baseScopes: ['openid', 'openid'] },
      },
      {
        ...valid,
        auth: { ...valid.auth, allowedHosts: ['API.EXAMPLE.COM'] },
      },
      {
        ...valid,
        auth: { ...valid.auth, tokenUrl: 'http://auth.example.com/token' },
      },
      {
        ...valid,
        auth: {
          ...valid.auth,
          registration: {
            ...valid.auth.registration,
            configSchema: {},
          },
        },
      },
    ] as unknown as AnyProviderDefinition[]

    for (const invalidProvider of invalidProviders) {
      expect(() =>
        build([
          collected(
            extension('fixture.invalid-provider', {
              providers: [invalidProvider],
            }),
          ),
        ]),
      ).toThrow('Invalid OAuth2 Provider definition')
    }
  })

  test('validates registration environment mappings against the config schema', () => {
    const original = oauthProvider()
    const base = {
      ...original,
      auth: {
        ...original.auth,
        registration: {
          ...original.auth.registration,
          configSchema: z
            .object({
              clientId: z.string(),
              clientSecret: z.string().optional(),
            })
            .transform((config) => config),
        },
      },
    } as OAuthProviderDefinition
    const withEnvironment = (
      environment: Readonly<Record<string, string>>,
    ): AnyProviderDefinition =>
      ({
        ...base,
        auth: {
          ...base.auth,
          registration: {
            ...base.auth.registration,
            environment,
          },
        },
      }) as unknown as AnyProviderDefinition
    const candidate = (definition: AnyProviderDefinition) =>
      build([
        collected(
          extension('fixture.environment-provider', {
            providers: [definition],
          }),
        ),
      ])

    expect(
      candidate(
        withEnvironment({
          clientId: 'GOOGLE_CLIENT_ID',
          clientSecret: '_GOOGLE_CLIENT_SECRET',
        }),
      ).providers.size,
    ).toBe(1)
    for (const environment of [
      {},
      { clientId: 'CTXINDEX_FIXTURE_CLIENT_ID' },
      {
        clientId: 'CTXINDEX_FIXTURE_CLIENT_ID',
        clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
        unknown: 'CTXINDEX_FIXTURE_UNKNOWN',
      },
      {
        clientId: '1INVALID_CLIENT_ID',
        clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
      },
      {
        clientId: 'GOOGLE-CLIENT-ID',
        clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
      },
      {
        clientId: 'google_CLIENT_ID',
        clientSecret: 'CTXINDEX_FIXTURE_CLIENT_SECRET',
      },
      {
        clientId: 'CTXINDEX_FIXTURE_VALUE',
        clientSecret: 'CTXINDEX_FIXTURE_VALUE',
      },
    ]) {
      expect(() => candidate(withEnvironment(environment))).toThrow(
        'Invalid OAuth2 Provider definition',
      )
    }

    const missingEnvironment = {
      ...base,
      auth: {
        ...base.auth,
        registration: {
          type: base.auth.registration.type,
          configSchema: base.auth.registration.configSchema,
        },
      },
    } as unknown as AnyProviderDefinition
    expect(() => candidate(missingEnvironment)).toThrow(
      'Invalid OAuth2 Provider definition',
    )
  })

  test('validates capabilities and Actions after collecting transitive Profiles', () => {
    const output = profile('fixture.output')
    const input = {
      ...profile('fixture.input'),
      actions: {
        'fixture.create': {
          effect: 'reversible',
          input: z.object({ title: z.string() }),
          output: { id: output.id, version: output.version },
        },
      },
    } as AnyProfileDefinition
    const invalidAdapter = {
      ...adapter({ profiles: [input] }),
      actions: {
        'fixture.create': {
          profile: input,
          input: z.object({ title: z.number() }),
          output,
          run: async () => ({
            ref: 'ctx://source/item',
            profile: output,
            payload: { title: 'created' },
          }),
        },
      },
    } as AnyAdapterDefinition

    expect(() =>
      build([
        collected(extension('fixture.actions', { adapters: [invalidAdapter] })),
      ]),
    ).toThrow('Incompatible input schema for Action fixture.create')
  })

  test('rejects legacy Extension, Provider, and Profile references', () => {
    const legacyExtension = {
      ...extension('fixture.legacy-extension'),
      dependencies: [],
    } as AnyExtensionDefinition
    const legacyProviderAdapter = {
      ...adapter(),
      provider: { kind: 'provider-ref', id: 'fixture.provider' },
    } as unknown as AnyAdapterDefinition
    const legacyProfileAdapter = {
      ...adapter(),
      profiles: [{ kind: 'profile-ref', id: 'fixture.note', version: 1 }],
    } as unknown as AnyAdapterDefinition

    expect(() => build([collected(legacyExtension)])).toThrow(
      'Invalid Extension definition',
    )
    expect(() =>
      build([
        collected(
          extension('fixture.legacy-provider', {
            adapters: [legacyProviderAdapter],
          }),
        ),
      ]),
    ).toThrow('Invalid Provider definition')
    expect(() =>
      build([
        collected(
          extension('fixture.legacy-profile', {
            adapters: [legacyProfileAdapter],
          }),
        ),
      ]),
    ).toThrow('Invalid Profile definition')
  })

  test('rejects embedded definition docs at every root and leaf boundary', () => {
    const documentedExtension = {
      ...extension('fixture.documented-extension'),
      docs: { summary: 'Removed' },
    } as AnyExtensionDefinition
    const documentedProvider = {
      ...provider(),
      docs: { summary: 'Removed' },
    } as AnyProviderDefinition
    const documentedProfile = {
      ...profile(),
      docs: { summary: 'Removed' },
    } as AnyProfileDefinition
    const documentedNestedProfile = {
      ...profile('fixture.documented-nested'),
      search: {
        fields: {
          title: {
            type: 'string',
            extract: () => 'title',
            docs: 'Removed',
          },
        },
      },
    } as AnyProfileDefinition
    const documentedAdapter = {
      ...adapter(),
      docs: { summary: 'Removed' },
    } as AnyAdapterDefinition

    for (const root of [
      documentedExtension,
      extension('fixture.documented-provider', {
        providers: [documentedProvider],
      }),
      extension('fixture.documented-profile', {
        profiles: [documentedProfile],
      }),
      extension('fixture.documented-nested-profile', {
        profiles: [documentedNestedProfile],
      }),
      extension('fixture.documented-adapter', {
        adapters: [documentedAdapter],
      }),
    ]) {
      expect(() => build([collected(root)])).toThrow(
        'Embedded definition docs are not supported',
      )
    }
  })

  test('rejects a conflicting candidate without mutating a prior registry', () => {
    const active = build([
      collected(
        extension('fixture.active', {
          adapters: [adapter({ provider: provider(), profiles: [profile()] })],
        }),
      ),
    ])
    const snapshot = {
      extensions: [...active.extensions],
      providers: [...active.providers],
      profiles: [...active.profiles],
      adapters: [...active.adapters],
      provenances: [...active.provenances],
    }

    expect(() =>
      build([
        collected(
          extension('fixture.first', {
            providers: [provider()],
          }),
        ),
        collected(
          extension('fixture.conflict', {
            providers: [oauthProvider('fixture.provider')],
          }),
        ),
      ]),
    ).toThrow('Conflicting Provider fixture.provider')
    expect({
      extensions: [...active.extensions],
      providers: [...active.providers],
      profiles: [...active.profiles],
      adapters: [...active.adapters],
      provenances: [...active.provenances],
    }).toEqual(snapshot)
  })
})
