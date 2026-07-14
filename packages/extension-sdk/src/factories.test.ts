import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  type InferProfilePayload,
} from './index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T

const noteProfile = defineProfile({
  id: 'fake.note',
  version: 1,
  schema: z.object({ title: z.string(), pinned: z.boolean() }),
  search: {
    title: (payload) => payload.title,
    fields: {
      pinned: { type: 'boolean', extract: (payload) => payload.pinned },
    },
  },
  docs: { summary: 'A fake note', aliases: ['note'] },
})

const noteAdapter = defineAdapter({
  id: 'fake.notes',
  version: 1,
  configSchema: z.object({ root: z.string().describe('Notes root') }),
  auth: { kind: 'none' },
  profiles: [{ id: 'fake.note', version: 1 }],
  capabilities: ['retrieve'],
  operations: { retrieve: async () => ({}) },
  actions: {},
})

defineAdapter({
  id: 'fake.missing-operation',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  capabilities: ['retrieve'],
  // @ts-expect-error a declared capability requires its operation
  operations: {},
  actions: {},
})

defineAdapter({
  id: 'fake.forbidden-operation',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  capabilities: [],
  operations: {
    // @ts-expect-error an omitted capability forbids its operation
    sync: async () => ({}),
  },
  actions: {},
})

defineAdapter({
  id: 'fake.capability-contexts',
  version: 1,
  configSchema: z.object({}),
  auth: { kind: 'none' },
  profiles: [],
  capabilities: ['retrieve'],
  operations: {
    retrieve: (context) => {
      const ref: string = context.ref
      // @ts-expect-error retrieve does not receive sync cursor access
      context.cursor
      return ref
    },
  },
  actions: {},
})

const noteExtension = defineExtension({
  id: 'fake.notes',
  version: 1,
  profiles: [noteProfile],
  adapters: [noteAdapter],
})

type _ProfileIdInference = Assert<Equal<typeof noteProfile.id, 'fake.note'>>
type _ProfilePayloadInference = Assert<
  Equal<
    InferProfilePayload<typeof noteProfile>,
    { title: string; pinned: boolean }
  >
>
type _AdapterIdInference = Assert<Equal<typeof noteAdapter.id, 'fake.notes'>>
type _ExtensionIdInference = Assert<
  Equal<typeof noteExtension.id, 'fake.notes'>
>

describe('extension SDK definition factories', () => {
  test('return plain definitions without wrapping or mutation', () => {
    expect(noteProfile.id).toBe('fake.note')
    expect(noteAdapter.capabilities).toEqual(['retrieve'])
    expect(noteExtension.profiles[0]).toBe(noteProfile)
    expect(Object.getPrototypeOf(noteExtension)).toBe(Object.prototype)
  })

  test('has no runtime dependency on @ctxindex/core', async () => {
    const source = await readFile(`${import.meta.dir}/index.ts`, 'utf8')
    expect(source).not.toContain("from '@ctxindex/core")
    expect(source).not.toContain('from "@ctxindex/core')
  })
})
