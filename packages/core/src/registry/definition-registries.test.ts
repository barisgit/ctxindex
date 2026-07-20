import { describe, expect, test } from 'bun:test'
import {
  auth,
  defineAdapter,
  defineExtension,
  defineProfile,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'
import {
  createAdapterRegistry,
  createExtensionRegistry,
  DefinitionRegistryError,
} from './definition-registries'
import { createProfileRegistry } from './profile-registry'

const createDraftInput = z.object({ subject: z.string() })
const messageProfile = defineProfile({
  id: 'fake.message',
  version: 1,
  schema: z.object({ subject: z.string() }),
  actions: {
    'fake.message.draft.create': {
      effect: 'reversible',
      input: createDraftInput,
      output: { id: 'fake.message', version: 1 },
    },
  },
})

function providerlessAdapter() {
  return defineAdapter({
    id: 'fake.local-mailbox',
    configSchema: z.object({ root: z.string() }),
    profiles: [messageProfile],
    routing: 'indexed',
    capabilities: ['retrieve'],
    operations: { retrieve: async () => {} },
    actions: {
      'fake.message.draft.create': {
        profile: messageProfile,
        input: createDraftInput,
        output: messageProfile,
        run: async () => ({
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/one',
          profile: { id: 'fake.message', version: 1 },
          payload: { subject: 'Draft' },
        }),
      },
    },
  })
}

const oauthProvider = defineProvider({
  id: 'fake.oauth',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.test/authorize',
    tokenUrl: 'https://auth.example.test/token',
    identity: {
      url: 'https://api.example.test/userinfo',
      subjectPath: ['sub'],
      labelPaths: [['email']],
      identities: [{ kind: 'email', path: ['email'] }],
    },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string() }),
      environment: { clientId: 'CTXINDEX_FAKE_CLIENT_ID' },
    },
    baseScopes: ['openid'],
    allowedHosts: ['api.example.test', 'auth.example.test'],
  }),
})

const oauthAdapter = defineAdapter({
  id: 'fake.remote-mailbox',
  configSchema: z.object({}),
  provider: oauthProvider,
  access: { scopes: ['mail.read'] },
  providerApiHosts: ['api.example.test'],
  profiles: [messageProfile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

describe('AdapterRegistry', () => {
  test('projects providerless Adapters and exact imported Profiles', () => {
    const adapter = providerlessAdapter()
    const registry = createAdapterRegistry(createProfileRegistry([]), [adapter])

    expect(registry.list()).toEqual([adapter])
    expect(registry.get({ id: adapter.id })).toBe(adapter)
    expect(registry.get({ id: 'missing' })).toBeUndefined()
    expect(registry.profiles.get(messageProfile)).toBe(messageProfile)
    expect(adapter.provider).toBeUndefined()
  })

  test('delegates capability and identity validation to the complete registry', () => {
    const invalidCapability = {
      ...providerlessAdapter(),
      operations: {},
    }
    expect(() =>
      createAdapterRegistry(createProfileRegistry([]), [invalidCapability]),
    ).toThrow('Capability retrieve requires operation retrieve')

    const conflicting = {
      ...providerlessAdapter(),
      configSchema: z.object({ other: z.string() }),
    }
    expect(() =>
      createAdapterRegistry(createProfileRegistry([]), [
        providerlessAdapter(),
        conflicting,
      ]),
    ).toThrow('Conflicting Adapter fake.local-mailbox')
  })

  test('exposes the exact imported OAuth Provider', () => {
    const registry = createAdapterRegistry(createProfileRegistry([]), [
      oauthAdapter,
    ])

    expect(registry.getOAuthProvider(oauthProvider.id)).toBe(oauthProvider)
    expect(registry.getOAuthProvider('missing')).toBeUndefined()
  })
})

describe('ExtensionRegistry', () => {
  const base = defineExtension({
    id: 'fake.base',
    providers: [oauthProvider],
    profiles: [messageProfile],
    adapters: [providerlessAdapter(), oauthAdapter],
  })

  test('projects complete-registry construction through the legacy facade', () => {
    const registry = createExtensionRegistry([base])

    expect(registry.list()).toEqual([base])
    expect(registry.profiles.get(messageProfile)).toBe(messageProfile)
    expect(registry.adapters.profiles).toBe(registry.profiles)
    expect(registry.adapters.get({ id: oauthAdapter.id })).toBe(oauthAdapter)
    expect(registry.adapters.getOAuthProvider(oauthProvider.id)).toBe(
      oauthProvider,
    )
  })

  test('registers atomically by rebuilding one complete candidate', () => {
    const registry = createExtensionRegistry([base])
    const conflictingAdapter = {
      ...providerlessAdapter(),
      configSchema: z.object({ conflict: z.string() }),
    }
    const invalid = defineExtension({
      id: 'fake.invalid',
      adapters: [conflictingAdapter],
    })

    expect(() => registry.register(invalid)).toThrow(DefinitionRegistryError)
    expect(registry.list()).toEqual([base])
    expect(registry.adapters.get({ id: providerlessAdapter().id })).toBe(
      base.adapters[0],
    )
  })

  test('keys Extensions and Adapters by stable id only', () => {
    const registry = createExtensionRegistry([base])
    const conflicting = defineExtension({
      id: base.id,
      profiles: [
        defineProfile({
          id: 'fake.other',
          version: 1,
          schema: z.object({ value: z.string() }),
        }),
      ],
    })

    expect(() => registry.register(conflicting)).toThrow(
      'Conflicting Extension fake.base',
    )
    expect(registry.list()).toEqual([base])
  })

  test('rejects unknown Action outputs without mutating state', () => {
    const registry = createExtensionRegistry([base])
    const invalidProfile = defineProfile({
      id: 'fake.invalid-output',
      version: 1,
      schema: z.object({ value: z.string() }),
      actions: {
        'fake.invalid-output.create': {
          effect: 'reversible',
          input: z.object({ value: z.string() }),
          output: { id: 'fake.missing', version: 1 },
        },
      },
    })

    expect(() =>
      registry.register(
        defineExtension({
          id: 'fake.invalid-output-extension',
          profiles: [invalidProfile],
        }),
      ),
    ).toThrow(
      'Action fake.invalid-output.create references unknown output Profile fake.missing@1',
    )
    expect(registry.list()).toEqual([base])
  })
})
