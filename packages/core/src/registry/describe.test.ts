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
})
