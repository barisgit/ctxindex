import { describe, expect, test } from 'bun:test'
import {
  auth,
  defineExtension,
  defineOAuthApp,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  type CompleteRegistry,
  type DefinitionProvenance,
} from '../registry'
import {
  type ManagedOAuthAppPolicy,
  resolveManagedOAuthApp,
} from './managed-policy'

const provider = defineProvider({
  id: 'fixture.oauth',
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

function provenance(
  origin: DefinitionProvenance['origin'],
  packageName: string,
): DefinitionProvenance {
  return {
    origin,
    packageName,
    entry: `${origin}:${packageName}`,
    exportName: 'extension',
  }
}

function collected(
  definition: ReturnType<typeof defineExtension>,
  origin: DefinitionProvenance['origin'],
  packageName: string,
): CollectedExtension {
  return { definition, provenance: provenance(origin, packageName) }
}

function registry(
  options: {
    readonly label?: string
    readonly extensionId?: string
    readonly packageName?: string
    readonly origin?: DefinitionProvenance['origin']
    readonly clientId?: string
  } = {},
): CompleteRegistry {
  const app = defineOAuthApp(provider, {
    label: options.label ?? 'desktop',
    config: { clientId: options.clientId ?? 'public-client' },
  })
  const extension = defineExtension({
    id: options.extensionId ?? 'fixture.official',
    oauthApps: [app],
  })
  return buildCompleteCandidateRegistry({
    roots: [
      collected(
        extension,
        options.origin ?? 'builtin',
        options.packageName ?? '@ctxindex/official',
      ),
    ],
    localOAuthAppIdentities: [],
  })
}

function policy(
  overrides: Partial<ManagedOAuthAppPolicy> = {},
): ManagedOAuthAppPolicy {
  return {
    providerId: 'fixture.oauth',
    label: 'desktop',
    extensionId: 'fixture.official',
    distributions: [{ kind: 'bundled', packageName: '@ctxindex/official' }],
    ...overrides,
  }
}

describe('resolveManagedOAuthApp', () => {
  test('selects only an exact App identity, owning Extension, and bundled distribution match', () => {
    expect(
      resolveManagedOAuthApp(registry(), [policy()], 'fixture.oauth'),
    ).toEqual({
      status: 'selected',
      providerId: 'fixture.oauth',
      label: 'desktop',
    })
  })

  test('distinguishes absent policy, inactive App, and provenance mismatch', () => {
    const active = registry()
    expect(resolveManagedOAuthApp(active, [], 'fixture.oauth')).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'not_configured',
    })
    expect(
      resolveManagedOAuthApp(
        active,
        [policy({ label: 'inactive' })],
        'fixture.oauth',
      ),
    ).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'not_active',
    })
    expect(
      resolveManagedOAuthApp(
        active,
        [policy({ extensionId: 'fixture.other' })],
        'fixture.oauth',
      ),
    ).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'provenance_mismatch',
    })
    expect(
      resolveManagedOAuthApp(
        active,
        [
          policy({
            distributions: [
              { kind: 'bundled', packageName: '@ctxindex/other' },
            ],
          }),
        ],
        'fixture.oauth',
      ),
    ).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'provenance_mismatch',
    })
    expect(
      resolveManagedOAuthApp(
        registry({ origin: 'explicit-path' }),
        [policy()],
        'fixture.oauth',
      ),
    ).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'provenance_mismatch',
    })
  })

  test('rejects a policy owner that contains only a structurally matching App', () => {
    const active = registry()
    const activeApp = active.oauthApps.get('["fixture.oauth","desktop"]')
    if (activeApp === undefined) throw new TypeError('fixture App missing')
    const wrongOwnerApp = defineOAuthApp(provider, {
      label: 'desktop',
      config: { clientId: 'public-client' },
    })
    const wrongOwner = defineExtension({
      id: 'fixture.wrong-owner',
      oauthApps: [wrongOwnerApp],
    })
    const guarded = {
      ...active,
      extensions: new Map(active.extensions).set(wrongOwner.id, wrongOwner),
      provenances: new Map(active.provenances).set(
        `extension:${wrongOwner.id}`,
        active.provenances.get('extension:fixture.official') ?? [],
      ),
    } satisfies CompleteRegistry

    expect(
      resolveManagedOAuthApp(
        guarded,
        [policy({ extensionId: wrongOwner.id })],
        'fixture.oauth',
      ),
    ).toEqual({
      status: 'unavailable',
      providerId: 'fixture.oauth',
      reason: 'provenance_mismatch',
    })
  })

  test('fails closed when more than one policy entry is configured for a Provider', () => {
    expect(
      resolveManagedOAuthApp(registry(), [policy(), policy()], 'fixture.oauth'),
    ).toEqual({
      status: 'invalid_policy',
      providerId: 'fixture.oauth',
      reason: 'ambiguous',
    })
  })

  test('does not inspect App config, client ids, or Adapter scopes', () => {
    const active = registry({ clientId: 'copied-public-client-id' })
    const app = active.oauthApps.get('["fixture.oauth","desktop"]')
    if (app === undefined) throw new TypeError('fixture App missing')
    Object.defineProperty(app, 'config', {
      get() {
        throw new TypeError('managed selection inspected App config')
      },
    })
    const adapters = new Map([
      [
        'fixture.community',
        Object.defineProperty({}, 'access', {
          get() {
            throw new TypeError('managed selection inspected Adapter scopes')
          },
        }),
      ],
    ])
    const guarded = { ...active, adapters } as unknown as CompleteRegistry

    expect(
      resolveManagedOAuthApp(guarded, [policy()], 'fixture.oauth'),
    ).toEqual({
      status: 'selected',
      providerId: 'fixture.oauth',
      label: 'desktop',
    })
  })
})

describe('managed Apps use the ordinary Extension graph', () => {
  test('bundled and external Apps use the same factories while policy selects only exact bundled provenance', () => {
    const bundledApp = defineOAuthApp(provider, {
      label: 'bundled',
      config: { clientId: 'bundled-public-id' },
    })
    const externalApp = defineOAuthApp(provider, {
      label: 'external',
      config: { clientId: 'external-public-id' },
    })
    const active = buildCompleteCandidateRegistry({
      roots: [
        collected(
          defineExtension({
            id: 'fixture.bundled',
            oauthApps: [bundledApp],
          }),
          'builtin',
          '@ctxindex/official',
        ),
        collected(
          defineExtension({
            id: 'fixture.external',
            oauthApps: [externalApp],
          }),
          'explicit-path',
          '@fixture/community',
        ),
      ],
      localOAuthAppIdentities: [],
    })

    expect([...active.oauthApps.values()]).toEqual([bundledApp, externalApp])
    expect(
      resolveManagedOAuthApp(
        active,
        [
          policy({
            label: 'bundled',
            extensionId: 'fixture.bundled',
          }),
        ],
        'fixture.oauth',
      ),
    ).toMatchObject({ status: 'selected', label: 'bundled' })
    expect(
      resolveManagedOAuthApp(
        active,
        [
          policy({
            label: 'external',
            extensionId: 'fixture.external',
          }),
        ],
        'fixture.oauth',
      ),
    ).toMatchObject({ status: 'unavailable', reason: 'provenance_mismatch' })
  })

  test('authored official or managed fields cannot establish authority', () => {
    const app = {
      ...defineOAuthApp(provider, {
        label: 'self-asserted',
        config: { clientId: 'public-client' },
      }),
      official: true,
      managed: true,
    }
    const extension = defineExtension({
      id: 'fixture.self-asserted',
      oauthApps: [app],
    })

    expect(() =>
      buildCompleteCandidateRegistry({
        roots: [collected(extension, 'builtin', '@fixture/self-asserted')],
        localOAuthAppIdentities: [],
      }),
    ).toThrow('Invalid OAuth App definition')
  })

  test('duplicate App identities still reject through ordinary registry validation', () => {
    const app = defineOAuthApp(provider, {
      label: 'duplicate',
      config: { clientId: 'public-client' },
    })

    expect(() =>
      buildCompleteCandidateRegistry({
        roots: [
          collected(
            defineExtension({ id: 'fixture.first', oauthApps: [app] }),
            'builtin',
            '@ctxindex/official',
          ),
          collected(
            defineExtension({ id: 'fixture.second', oauthApps: [app] }),
            'explicit-path',
            '@fixture/community',
          ),
        ],
        localOAuthAppIdentities: [],
      }),
    ).toThrow('Duplicate OAuth App')
  })
})
