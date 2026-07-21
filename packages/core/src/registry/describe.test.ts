import { describe, expect, test } from 'bun:test'
import {
  type AnyProfileDefinition,
  auth,
  defineAdapter,
  defineExtension,
  defineProfile,
  defineProvider,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createExtensionRegistry } from './definition-registries'
import { describeRegistry } from './describe'

const publishInput = z.object({ title: z.string().describe('New title') })
const fakeProfile = defineProfile({
  id: 'fake.note',
  version: 1,
  schema: z.object({ title: z.string(), pinned: z.boolean() }),
  search: {
    title: (payload) => payload.title,
    fields: {
      pinned: { type: 'boolean', extract: (payload) => payload.pinned },
    },
  },
  exports: {
    markdown: {
      mediaType: 'text/markdown',
      render: (payload) => `# ${payload.title}`,
    },
  },
  actions: {
    'fake.note.publish': {
      effect: 'reversible',
      input: publishInput,
      output: { id: 'fake.note', version: 1 },
    },
  },
})
const fakeAdapter = defineAdapter({
  id: 'fake.notes',
  configSchema: z.object({
    root: z.string().describe('Directory containing notes'),
  }),
  profiles: [fakeProfile],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {
    'fake.note.publish': {
      profile: fakeProfile,
      input: publishInput,
      output: fakeProfile,
      run: async () => ({
        ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/one',
        profile: { id: 'fake.ticket', version: 1 },
        payload: { title: 'Draft' },
      }),
    },
  },
})

describe('registry-derived describe data', () => {
  test('a fake Profile changes kinds, vocabulary, Source config, and Actions', () => {
    expect(describeRegistry(createExtensionRegistry())).toEqual({
      kinds: [],
      sources: [],
      actions: [],
    })

    const registry = createExtensionRegistry([
      defineExtension({
        id: 'fake',
        profiles: [fakeProfile],
        adapters: [fakeAdapter],
      }),
    ])
    const result = describeRegistry(registry)

    expect(result.kinds).toEqual([
      {
        id: 'fake.note',
        version: 1,
        fields: [{ name: 'pinned', type: 'boolean' }],
        formats: [{ name: 'markdown', mediaType: 'text/markdown' }],
      },
    ])
    expect(result.sources[0]).toMatchObject({
      id: 'fake.notes',
      profiles: [{ id: 'fake.note', version: 1 }],
      capabilities: ['retrieve'],
      providerApiHosts: [],
      config: {
        type: 'object',
        properties: {
          root: {
            type: 'string',
            description: 'Directory containing notes',
          },
        },
        required: ['root'],
        additionalProperties: false,
      },
    })
    expect(result.actions).toEqual([
      {
        id: 'fake.note.publish',
        profile: { id: 'fake.note', version: 1 },
        effect: 'reversible',
        input: expect.objectContaining({ type: 'object' }),
        output: { id: 'fake.note', version: 1 },
        adapters: [{ id: 'fake.notes' }],
      },
    ])
    expect(Reflect.ownKeys(result.actions[0]?.input ?? {})).not.toContain(
      '~standard',
    )
  })

  test('projects Provider registration config as plain JSON Schema', () => {
    const provider = defineProvider({
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
          configSchema: z
            .object({
              clientId: z.string().min(1).describe('OAuth client id'),
            })
            .strict(),
          environment: { clientId: 'CTXINDEX_FAKE_CLIENT_ID' },
        },
        baseScopes: ['openid'],
        allowedHosts: ['api.example.test', 'auth.example.test'],
      }),
    })
    const adapter = defineAdapter({
      id: 'fake.oauth-adapter',
      provider,
      access: { scopes: ['fake.read'] },
      providerApiHosts: ['api.example.test'],
      configSchema: z.object({}),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })

    const result = describeRegistry({
      profiles: { list: () => [] },
      adapters: { list: () => [adapter] },
    })
    const serialized = JSON.parse(JSON.stringify(result)) as {
      sources: {
        provider?: {
          auth?: {
            registration?: { configSchema?: object }
          }
        }
      }[]
    }

    expect(
      serialized.sources[0]?.provider?.auth?.registration?.configSchema,
    ).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          minLength: 1,
          description: 'OAuth client id',
        },
      },
      required: ['clientId'],
      additionalProperties: false,
    })
    expect(JSON.stringify(serialized)).not.toContain('"def"')
  })

  test('sorts definitions and binds duplicate Action ids by exact Profile', () => {
    const actionInput = z.object({ value: z.string() })
    const makeProfile = (id: 'z.kind' | 'a.kind') =>
      defineProfile({
        id,
        version: 1,
        schema: z.object({ value: z.string() }),
        search: {
          fields: {
            zebra: { type: 'string', extract: (payload) => payload.value },
            alpha: { type: 'string', extract: (payload) => payload.value },
          },
        },
        exports: {
          zeta: { mediaType: 'text/zeta', render: () => '' },
          alpha: { mediaType: 'text/alpha', render: () => '' },
        },
        actions: {
          shared: {
            effect: 'reversible',
            input: actionInput,
            output: { id, version: 1 },
          },
        },
      })
    const makeAdapter = (
      id: 'z.adapter' | 'a.adapter',
      profile: AnyProfileDefinition,
    ) =>
      defineAdapter({
        id,
        configSchema: z.object({
          foo_bar: z.string().describe('Foo path'),
          count: z.number().int().default(2),
          labels: z.array(z.string()).optional(),
          enabled: z.boolean().optional(),
        }),
        profiles: [profile],
        routing: 'indexed',
        capabilities: ['retrieve', 'sync'],
        operations: { retrieve: async () => {}, sync: async () => {} },
        actions: {
          shared: {
            profile,
            input: actionInput,
            output: profile,
            run: async () => ({
              ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/one',
              profile: { id: profile.id, version: profile.version },
              payload: { value: 'one' },
            }),
          },
        },
      })
    const zProfile = makeProfile('z.kind')
    const aProfile = makeProfile('a.kind')
    const zAdapter = makeAdapter('z.adapter', zProfile)
    const aAdapter = makeAdapter('a.adapter', aProfile)

    const result = describeRegistry({
      profiles: { list: () => [zProfile, aProfile] },
      adapters: { list: () => [zAdapter, aAdapter] },
    })

    expect(result.kinds.map(({ id }) => id)).toEqual(['a.kind', 'z.kind'])
    expect(result.kinds[0]?.fields.map(({ name }) => name)).toEqual([
      'alpha',
      'zebra',
    ])
    expect(result.kinds[0]?.formats.map(({ name }) => name)).toEqual([
      'alpha',
      'zeta',
    ])
    expect(result.sources.map(({ id }) => id)).toEqual([
      'a.adapter',
      'z.adapter',
    ])
    expect(result.sources[0]).toMatchObject({
      routing: 'indexed',
      capabilities: ['retrieve', 'sync'],
      configOptions: [
        {
          property: 'count',
          flag: '--config-count',
          type: 'integer',
          required: false,
          default: 2,
        },
        {
          property: 'enabled',
          flag: '--config-enabled',
          type: 'boolean',
          required: false,
        },
        {
          property: 'foo_bar',
          flag: '--config-foo-bar',
          type: 'string',
          required: true,
        },
        {
          property: 'labels',
          flag: '--config-labels',
          type: 'string[]',
          required: false,
        },
      ],
    })
    expect(result.actions).toHaveLength(2)
    expect(result.actions[0]).toMatchObject({
      id: 'shared',
      profile: { id: 'a.kind', version: 1 },
      adapters: [{ id: 'a.adapter' }],
    })
    expect(result.actions[1]).toMatchObject({
      id: 'shared',
      profile: { id: 'z.kind', version: 1 },
      adapters: [{ id: 'z.adapter' }],
    })
  })

  test('uses strict ordering and collision-safe JSON-capable config flags', () => {
    const adapter = defineAdapter({
      id: 'config.adapter',
      configSchema: z.object({
        foo_bar: z.string(),
        'foo-bar': z.string(),
        'foo_bar--666f6f5f626172': z.string(),
        json: z.string(),
        nested: z.object({ token: z.string() }).describe('Nested credentials'),
      }),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const result = describeRegistry({
      profiles: { list: () => [] },
      adapters: { list: () => [adapter] },
    })

    expect(result.sources[0]?.configOptions).toEqual([
      {
        property: 'foo-bar',
        flag: '--config--666f6f2d626172',
        type: 'string',
        required: true,
      },
      {
        property: 'foo_bar',
        flag: '--config--666f6f5f626172',
        type: 'string',
        required: true,
      },
      {
        property: 'foo_bar--666f6f5f626172',
        flag: '--config-foo-bar--666f6f5f626172',
        type: 'string',
        required: true,
      },
      {
        property: 'json',
        flag: '--config--6a736f6e',
        type: 'string',
        required: true,
      },
      {
        property: 'nested',
        flag: '--config-nested',
        type: 'json',
        required: true,
      },
    ])
  })

  test('sorts descriptor strings by Unicode code point', () => {
    const profiles = [
      'a.kind',
      '_kind',
      'A.kind',
      '!kind',
      '𐀀.kind',
      '\uE000.kind',
    ].map((id) => defineProfile({ id, version: 1, schema: z.object({}) }))
    const result = describeRegistry({
      profiles: { list: () => profiles },
      adapters: { list: () => [] },
    })
    expect(result.kinds.map(({ id }) => id)).toEqual([
      '!kind',
      'A.kind',
      '_kind',
      'a.kind',
      '\uE000.kind',
      '𐀀.kind',
    ])
  })
})
