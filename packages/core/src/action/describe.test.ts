import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createExtensionRegistry } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { describeAction } from './describe'

const actionId = 'fake.note.create'
const actionInputSchema = z.object({ body: z.string().min(1) })
const profile = defineProfile({
  id: 'fake.note',
  version: 2,
  schema: z.object({ body: z.string() }),
  actions: {
    [actionId]: {
      effect: 'reversible',
      input: actionInputSchema,
      output: { id: 'fake.note', version: 2 },
    },
  },
})
const boundAdapter = defineAdapter({
  id: 'fake.bound',
  configSchema: z.object({}).strict(),
  profiles: [profile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {
    [actionId]: {
      profile,
      input: actionInputSchema,
      output: profile,
      async run() {
        adapterCalls += 1
        throw new Error('must not run')
      },
    },
  },
})
const unboundAdapter = defineAdapter({
  id: 'fake.unbound',
  configSchema: z.object({}).strict(),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})
let adapterCalls = 0
const registry = createExtensionRegistry([
  defineExtension({
    id: 'fake.actions',
    profiles: [profile],
    adapters: [boundAdapter, unboundAdapter],
  }),
])
const dbs: Database[] = []

afterEach(() => {
  adapterCalls = 0
  for (const db of dbs.splice(0)) db.close(false)
})

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  const insert = db.prepare(`INSERT INTO sources
    (id, realm_id, label, adapter_id, config_json, sync_enabled, created_at, updated_at)
    VALUES (?, 'realm-1', ?, ?, '{}', 1, 1, 1)`)
  insert.run('source-z', 'Bound Source', 'fake.bound')
  insert.run('source-a', 'Unbound Source', 'fake.unbound')
  insert.run('source-m', 'Missing Source', 'fake.missing')
  return db
}

describe('describeAction', () => {
  test('returns the exact registry projection and all Sources sorted by id', async () => {
    const db = await freshDb()
    expect(describeAction({ db, registry, actionId })).toEqual({
      id: actionId,
      profile: { id: 'fake.note', version: 2 },
      effect: 'reversible',
      input: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { body: { type: 'string', minLength: 1 } },
        required: ['body'],
        additionalProperties: false,
      },
      output: { id: 'fake.note', version: 2 },
      adapters: [{ id: 'fake.bound' }],
      sources: [
        {
          id: 'source-a',
          adapter: { id: 'fake.unbound' },
          available: false,
          reason: 'action_unsupported',
        },
        {
          id: 'source-m',
          adapter: { id: 'fake.missing' },
          available: false,
          reason: 'adapter_unavailable',
        },
        {
          id: 'source-z',
          adapter: { id: 'fake.bound' },
          available: true,
        },
      ],
    })
    expect(adapterCalls).toBe(0)
  })

  test('reports only an exact selected Source', async () => {
    const db = await freshDb()
    expect(
      describeAction({ db, registry, actionId, sourceId: 'source-z' }).sources,
    ).toEqual([
      {
        id: 'source-z',
        adapter: { id: 'fake.bound' },
        available: true,
      },
    ])
  })

  test('uses typed errors for unknown Action and selected Source', async () => {
    const db = await freshDb()
    expect(() =>
      describeAction({ db, registry, actionId: 'fake.unknown' }),
    ).toThrow(expect.objectContaining({ code: 'unknown_action' }))
    expect(() =>
      describeAction({ db, registry, actionId, sourceId: 'source-missing' }),
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})
