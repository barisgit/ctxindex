import { describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
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
      pinned: {
        type: 'boolean',
        extract: (payload) => payload.pinned,
        docs: 'Whether the note is pinned',
      },
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
      docs: 'Publish the note',
      examples: [{ title: 'Release notes' }],
    },
  },
  docs: {
    summary: 'A fake note',
    aliases: ['note'],
  },
})
const fakeAdapter = defineAdapter({
  id: 'fake.notes',
  version: 1,
  configSchema: z.object({
    root: z.string().describe('Directory containing notes'),
  }),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: { retrieve: async () => {} },
  actions: {
    'fake.note.publish': {
      profile: { id: 'fake.note', version: 1 },
      input: publishInput,
      output: { id: 'fake.note', version: 1 },
      run: async () => ({
        ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/draft/one',
        profile: { id: 'fake.ticket', version: 1 },
        payload: { title: 'Draft' },
      }),
    },
  },
  docs: { summary: 'Fake notes source' },
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
        version: 1,
        profiles: [fakeProfile],
        adapters: [fakeAdapter],
      }),
    ])
    const result = describeRegistry(registry)

    expect(result.kinds).toEqual([
      {
        id: 'fake.note',
        version: 1,
        summary: 'A fake note',
        aliases: ['note'],
        fields: [
          {
            name: 'pinned',
            type: 'boolean',
            docs: 'Whether the note is pinned',
          },
        ],
        formats: [{ name: 'markdown', mediaType: 'text/markdown' }],
      },
    ])
    expect(result.sources[0]).toMatchObject({
      id: 'fake.notes',
      version: 1,
      summary: 'Fake notes source',
      profiles: [{ id: 'fake.note', version: 1 }],
      capabilities: ['retrieve'],
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
        docs: 'Publish the note',
        examples: [{ title: 'Release notes' }],
        adapters: [{ id: 'fake.notes', version: 1 }],
      },
    ])
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
            docs: `${id} shared`,
          },
        },
        docs: { summary: `${id} summary`, aliases: ['z-alias', 'a-alias'] },
      })
    const makeAdapter = (
      id: 'z.adapter' | 'a.adapter',
      profileId: 'z.kind' | 'a.kind',
    ) =>
      defineAdapter({
        id,
        version: 1,
        configSchema: z.object({
          foo_bar: z.string().describe('Foo path'),
          count: z.number().int().default(2),
          labels: z.array(z.string()).optional(),
          enabled: z.boolean().optional(),
        }),
        auth: { kind: 'none' },
        profiles: [{ id: profileId, version: 1 }],
        routing: 'indexed',
        capabilities: ['retrieve', 'sync'],
        operations: { retrieve: async () => {}, sync: async () => {} },
        actions: {
          shared: {
            profile: { id: profileId, version: 1 },
            input: actionInput,
            output: { id: profileId, version: 1 },
            run: async () => ({
              ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/one',
              profile: { id: profileId, version: 1 },
              payload: { value: 'one' },
            }),
          },
        },
      })
    const zProfile = makeProfile('z.kind')
    const aProfile = makeProfile('a.kind')
    const zAdapter = makeAdapter('z.adapter', 'z.kind')
    const aAdapter = makeAdapter('a.adapter', 'a.kind')

    const shuffledRegistry = {
      profiles: { list: () => [zProfile, aProfile] },
      adapters: { list: () => [zAdapter, aAdapter] },
    }
    const result = describeRegistry(shuffledRegistry)

    expect(result.kinds.map(({ id }) => id)).toEqual(['a.kind', 'z.kind'])
    expect(result.kinds[0]?.aliases).toEqual(['a-alias', 'z-alias'])
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
      auth: { kind: 'none' },
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
          docs: 'Foo path',
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
      adapters: [{ id: 'a.adapter', version: 1 }],
    })
    expect(result.actions[1]).toMatchObject({
      id: 'shared',
      profile: { id: 'z.kind', version: 1 },
      adapters: [{ id: 'z.adapter', version: 1 }],
    })
  })

  test('uses strict ordering and collision-safe JSON-capable config flags', () => {
    const adapter = defineAdapter({
      id: 'config.adapter',
      version: 1,
      configSchema: z.object({
        foo_bar: z.string(),
        'foo-bar': z.string(),
        'foo_bar--666f6f5f626172': z.string(),
        json: z.string(),
        nested: z.object({ token: z.string() }).describe('Nested credentials'),
      }),
      auth: { kind: 'none' },
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
        docs: 'Nested credentials',
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
    ].map((id) =>
      defineProfile({
        id,
        version: 1,
        schema: z.object({}),
        docs: { summary: 'Ordering fixture', aliases: ['a', '_', 'A', '!'] },
      }),
    )
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
    expect(result.kinds[0]?.aliases).toEqual(['!', 'A', '_', 'a'])
  })
})
