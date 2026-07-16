import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createProfileRegistry } from '../registry/profile-registry'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { ResourceStore } from './resource-store'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ref = `ctx://${sourceId}/records/one`
const dbs: Database[] = []

const fakeProfile = defineProfile({
  id: 'fake.record',
  version: 1,
  schema: z.object({
    name: z.string(),
    score: z.number(),
    active: z.boolean(),
    at: z.date(),
    tags: z.array(z.string()),
    body: z.string(),
    summary: z.string().optional(),
  }),
  search: {
    title: (payload) => payload.name,
    summary: (payload) => payload.summary ?? null,
    occurredAt: (payload) => payload.at,
    chunks: (payload) => [payload.body],
    fields: {
      name: { type: 'string', extract: (payload) => payload.name },
      score: { type: 'number', extract: (payload) => payload.score },
      active: { type: 'boolean', extract: (payload) => payload.active },
      at: { type: 'datetime', extract: (payload) => payload.at },
      tags: { type: 'string[]', extract: (payload) => payload.tags },
    },
  },
  relations: {
    tagged: (payload) =>
      payload.tags.map((value) => ({ field: 'name', value })),
  },
})

test('relation extractor failure rolls back an existing Resource and Relations', async () => {
  const db = await freshDb()
  const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
  await store.upsert({
    ref,
    sourceId,
    profile: { id: 'fake.record', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: {
      name: 'Before',
      score: 1,
      active: true,
      at: new Date(1),
      tags: ['before'],
      body: 'before',
    },
  })
  const broken = defineProfile({
    ...fakeProfile,
    relations: {
      tagged: () => {
        throw new Error('relation extraction failed')
      },
    },
  })

  expect(() =>
    new ResourceStore(db, createProfileRegistry([broken])).upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        name: 'After',
        score: 2,
        active: false,
        at: new Date(2),
        tags: ['after'],
        body: 'after',
      },
    }),
  ).toThrow('relation extraction failed')
  expect(
    db.prepare('SELECT title FROM resources WHERE ref = ?').get(ref),
  ).toEqual({
    title: 'Before',
  })
  expect(db.prepare('SELECT target_value FROM relations').all()).toEqual([
    { target_value: 'before' },
  ])
})

test('unknown Profile upsert clears derived Relations', async () => {
  const db = await freshDb()
  const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
  await store.upsert({
    ref,
    sourceId,
    profile: { id: 'fake.record', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: {
      name: 'Known',
      score: 1,
      active: true,
      at: new Date(1),
      tags: ['known'],
      body: 'known',
    },
  })

  store.upsert({
    ref,
    sourceId,
    profile: { id: 'fake.record', version: 2 },
    origin: 'synced',
    completeness: 'complete',
    title: 'Envelope only',
    payload: { ignored: true },
  })

  expect(db.prepare('SELECT count(*) AS count FROM relations').get()).toEqual({
    count: 0,
  })
})

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sourceId, 'personal', 'fake', 1, '{}', 1, 1)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('ResourceStore', () => {
  test('materializes a generic Profile-derived summary', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))

    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      summary: 'Envelope fallback',
      payload: {
        name: 'Record',
        score: 1,
        active: true,
        at: new Date(123),
        tags: [],
        body: 'body',
        summary: 'Profile summary',
      },
    })

    expect(store.get(ref)?.summary).toBe('Profile summary')
  })

  test('complete upserts hydrate the full stored Resource envelope', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))

    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      title: 'Explicit title',
      summary: 'Summary',
      providerUpdatedAt: 456,
      payload: {
        name: 'Derived title',
        score: 1,
        active: true,
        at: new Date(123),
        tags: [],
        body: 'body',
      },
    })

    expect(store.get(ref)).toEqual({
      id: expect.any(String),
      ref,
      sourceId,
      realmId: 'personal',
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      title: 'Derived title',
      summary: 'Summary',
      occurredAt: 123,
      providerUpdatedAt: 456,
      deletedAt: null,
      hydratedAt: expect.any(Number),
      payload: {
        name: 'Derived title',
        score: 1,
        active: true,
        at: '1970-01-01T00:00:00.123Z',
        tags: [],
        body: 'body',
      },
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  })

  test('merges every completeness and origin combination without inferring hydration from origin', async () => {
    const completenesses = ['partial', 'complete'] as const
    const origins = ['adhoc', 'synced'] as const

    for (const existingCompleteness of completenesses) {
      for (const existingOrigin of origins) {
        for (const incomingCompleteness of completenesses) {
          for (const incomingOrigin of origins) {
            const db = await freshDb()
            const store = new ResourceStore(
              db,
              createProfileRegistry([fakeProfile]),
            )
            const existingPayload = {
              name: 'Existing',
              score: 1,
              active: true,
              at: new Date(1),
              tags: ['existing'],
              body: 'existing body',
            }
            const incomingPayload = {
              name: 'Incoming',
              score: 2,
              active: false,
              at: new Date(2),
              tags: ['incoming'],
              body: 'incoming body',
            }

            store.upsert({
              ref,
              sourceId,
              profile: { id: 'fake.record', version: 1 },
              origin: existingOrigin,
              completeness: existingCompleteness,
              payload: existingPayload,
            })
            store.upsert({
              ref,
              sourceId,
              profile: { id: 'fake.record', version: 1 },
              origin: incomingOrigin,
              completeness: incomingCompleteness,
              title: 'Incoming envelope',
              payload: incomingPayload,
            })

            const incomingReplaces =
              incomingCompleteness === 'complete' ||
              existingCompleteness === 'partial'
            const stored = store.get(ref)
            expect(stored).toMatchObject({
              origin:
                existingOrigin === 'synced' || incomingOrigin === 'synced'
                  ? 'synced'
                  : 'adhoc',
              title: incomingReplaces ? 'Incoming' : 'Incoming envelope',
              payload: { name: incomingReplaces ? 'Incoming' : 'Existing' },
            })
            expect(stored?.hydratedAt === null).toBe(
              existingCompleteness === 'partial' &&
                incomingCompleteness === 'partial',
            )
            expect(db.prepare('SELECT content FROM chunks').all()).toEqual([
              {
                content: incomingReplaces ? 'incoming body' : 'existing body',
              },
            ])
            expect(
              db.prepare('SELECT target_value FROM relations').all(),
            ).toEqual([
              { target_value: incomingReplaces ? 'incoming' : 'existing' },
            ])
          }
        }
      }
    }
  })

  test('partial restoration preserves complete content, projections, hydration, and its Profile', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        name: 'Complete',
        score: 1,
        active: true,
        at: new Date(1),
        tags: ['preserved'],
        body: 'preserved body',
      },
    })
    const hydratedAt = store.get(ref)?.hydratedAt
    store.remove({ ref, sourceId, deletedAt: 100 })

    const result = store.upsert({
      ref,
      sourceId,
      profile: { id: 'missing.record', version: 2 },
      origin: 'adhoc',
      completeness: 'partial',
      title: 'Fresh envelope',
      summary: 'Fresh summary',
      occurredAt: 200,
      providerUpdatedAt: 301,
      payload: { ignored: true },
    })

    expect(result.warnings).toEqual([])
    expect(store.get(ref)).toMatchObject({
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      title: 'Fresh envelope',
      summary: 'Fresh summary',
      occurredAt: 200,
      providerUpdatedAt: 301,
      deletedAt: null,
      hydratedAt,
      payload: { name: 'Complete', body: 'preserved body' },
    })
    expect(() =>
      store.upsert({
        ref,
        sourceId,
        profile: { id: 'fake.record', version: 1 },
        origin: 'synced',
        completeness: 'partial',
        providerUpdatedAt: 301,
        payload: { ignored: true },
      }),
    ).not.toThrow()
    expect(store.get(ref)).toMatchObject({
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      title: null,
      summary: null,
      occurredAt: null,
      providerUpdatedAt: 301,
      deletedAt: null,
      hydratedAt,
      payload: { name: 'Complete', body: 'preserved body' },
    })
    expect(db.prepare('SELECT content FROM chunks').all()).toEqual([
      { content: 'preserved body' },
    ])
    expect(db.prepare('SELECT target_value FROM relations').all()).toEqual([
      { target_value: 'preserved' },
    ])
  })

  test('validates a known Profile and replaces typed fields and chunks', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))

    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: {
        name: 'First',
        score: 4.5,
        active: true,
        at: new Date(1_700_000_000_000),
        tags: ['one', 'two'],
        body: 'old body',
      },
    })
    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: {
        name: 'Second',
        score: 8,
        active: false,
        at: new Date(1_710_000_000_000),
        tags: ['only'],
        body: 'new body',
      },
    })

    const resource = db
      .prepare(
        'SELECT title, occurred_at, payload_json FROM resources WHERE ref = ?',
      )
      .get(ref) as Record<string, unknown>
    expect(resource.title).toBe('Second')
    expect(resource.occurred_at).toBe(1_710_000_000_000)
    expect(JSON.parse(resource.payload_json as string)).toEqual({
      name: 'Second',
      score: 8,
      active: false,
      at: '2024-03-09T16:00:00.000Z',
      tags: ['only'],
      body: 'new body',
    })
    expect(
      db
        .prepare(
          'SELECT relation, target_field, target_value FROM relations ORDER BY rowid',
        )
        .all(),
    ).toEqual([
      { relation: 'tagged', target_field: 'name', target_value: 'only' },
    ])

    expect(
      db
        .prepare(
          'SELECT field, declared_type, ordinal, value_text, value_number, value_integer FROM field_index ORDER BY field, ordinal',
        )
        .all(),
    ).toEqual([
      {
        field: 'active',
        declared_type: 'boolean',
        ordinal: 0,
        value_text: null,
        value_number: null,
        value_integer: 0,
      },
      {
        field: 'at',
        declared_type: 'datetime',
        ordinal: 0,
        value_text: null,
        value_number: null,
        value_integer: 1_710_000_000_000,
      },
      {
        field: 'name',
        declared_type: 'string',
        ordinal: 0,
        value_text: 'Second',
        value_number: null,
        value_integer: null,
      },
      {
        field: 'score',
        declared_type: 'number',
        ordinal: 0,
        value_text: null,
        value_number: 8,
        value_integer: null,
      },
      {
        field: 'tags',
        declared_type: 'string[]',
        ordinal: 0,
        value_text: 'only',
        value_number: null,
        value_integer: null,
      },
    ])
    expect(db.prepare('SELECT chunk_index, content FROM chunks').all()).toEqual(
      [{ chunk_index: 0, content: 'new body' }],
    )
  })

  test('ad-hoc and synced writes converge on one Source-scoped Resource', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    const payload = {
      name: 'One',
      score: 1,
      active: true,
      at: new Date(1),
      tags: [],
      body: 'body',
    }

    const adhoc = await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload,
    })
    const synced = await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload,
    })
    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload,
    })

    expect(synced.resourceId).toBe(adhoc.resourceId)
    expect(db.prepare('SELECT id, origin FROM resources').all()).toEqual([
      { id: adhoc.resourceId, origin: 'synced' },
    ])
  })

  test('rejects a Ref whose Source differs from the operation Source', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    expect(() =>
      store.upsert({
        ref: 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAA/one',
        sourceId,
        profile: { id: 'fake.record', version: 1 },
        origin: 'adhoc',
        completeness: 'complete',
        payload: {
          name: 'One',
          score: 1,
          active: true,
          at: new Date(1),
          tags: [],
          body: 'body',
        },
      }),
    ).toThrow('operation Source')
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 0 },
    )
  })

  test('tombstones synced Resources but excludes them by default', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    const payload = {
      name: 'One',
      score: 1,
      active: true,
      at: new Date(1),
      tags: [],
      body: 'body',
    }
    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload,
    })

    await store.remove({ ref, sourceId, deletedAt: 1234 })

    expect(store.get(ref)).toBeNull()
    expect(store.get(ref, { includeDeleted: true })).toMatchObject({
      ref,
      deletedAt: 1234,
      origin: 'synced',
    })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 1 },
    )
    expect(
      db.prepare('SELECT count(*) AS count FROM field_index').get(),
    ).toEqual({ count: 4 })
    expect(db.prepare('SELECT count(*) AS count FROM chunks').get()).toEqual({
      count: 1,
    })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'One'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'body'",
        )
        .get(),
    ).toEqual({ count: 1 })

    db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'One'",
        )
        .get(),
    ).toEqual({ count: 0 })
  })

  test('a later synced upsert restores a tombstoned Resource and projections', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    const payload = {
      name: 'One',
      score: 1,
      active: true,
      at: new Date(1),
      tags: [],
      body: 'body',
    }
    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload,
    })
    store.remove({ ref, sourceId, deletedAt: 1234 })

    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { ...payload, name: 'Restored' },
    })

    expect(store.get(ref)).toMatchObject({
      deletedAt: null,
      origin: 'synced',
      payload: { name: 'Restored' },
    })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'Restored'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'body'",
        )
        .get(),
    ).toEqual({ count: 1 })
  })

  test('evicts ad-hoc Resources and their projections instead of tombstoning', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    const payload = {
      name: 'One',
      score: 1,
      active: true,
      at: new Date(1),
      tags: [],
      body: 'body',
    }
    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload,
    })

    await store.remove({ ref, sourceId, deletedAt: 1234 })

    expect(store.get(ref, { includeDeleted: true })).toBeNull()
    expect(
      db.prepare('SELECT count(*) AS count FROM field_index').get(),
    ).toEqual({ count: 0 })
    expect(db.prepare('SELECT count(*) AS count FROM chunks').get()).toEqual({
      count: 0,
    })
  })

  test('rolls back the Resource and all projections on extraction failure', async () => {
    const db = await freshDb()
    const broken = defineProfile({
      ...fakeProfile,
      search: {
        ...fakeProfile.search,
        fields: {
          ...fakeProfile.search?.fields,
          score: { type: 'number' as const, extract: () => 'not a number' },
        },
      },
    })
    const store = new ResourceStore(db, createProfileRegistry([broken]))

    expect(() =>
      store.upsert({
        ref,
        sourceId,
        profile: { id: 'fake.record', version: 1 },
        origin: 'synced',
        completeness: 'complete',
        payload: {
          name: 'Invalid',
          score: 1,
          active: true,
          at: new Date(),
          tags: [],
          body: 'partial',
        },
      }),
    ).toThrow('score')

    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 0 },
    )
    expect(
      db.prepare('SELECT count(*) AS count FROM field_index').get(),
    ).toEqual({ count: 0 })
    expect(db.prepare('SELECT count(*) AS count FROM chunks').get()).toEqual({
      count: 0,
    })
  })

  test('unknown Profile versions degrade to envelope-only with a warning', async () => {
    const db = await freshDb()
    const warnings: unknown[] = []
    const store = new ResourceStore(
      db,
      createProfileRegistry([], {
        onWarning: (warning) => warnings.push(warning),
      }),
    )

    await store.upsert({
      ref,
      sourceId,
      profile: { id: 'missing.record', version: 2 },
      origin: 'adhoc',
      completeness: 'complete',
      title: 'Envelope title',
      payload: { unsafe: true },
    })

    expect(
      db
        .prepare('SELECT title, payload_json FROM resources WHERE ref = ?')
        .get(ref),
    ).toEqual({
      title: 'Envelope title',
      payload_json: null,
    })
    expect(
      db.prepare('SELECT count(*) AS count FROM field_index').get(),
    ).toEqual({ count: 0 })
    expect(warnings).toEqual([
      {
        code: 'unknown_profile_version',
        profileId: 'missing.record',
        profileVersion: 2,
      },
    ])
  })

  test('ad-hoc refresh cannot clobber a synced payload or projections', async () => {
    const db = await freshDb()
    const store = new ResourceStore(db, createProfileRegistry([fakeProfile]))
    const syncedPayload = {
      name: 'Synced',
      score: 1,
      active: true,
      at: new Date(1),
      tags: [],
      body: 'synced body',
    }
    const adhocPayload = {
      name: 'Remote',
      score: 2,
      active: false,
      at: new Date(2),
      tags: [],
      body: 'remote body',
    }

    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: syncedPayload,
    })
    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.record', version: 1 },
      origin: 'adhoc',
      completeness: 'partial',
      payload: adhocPayload,
    })

    expect(store.get(ref)).toMatchObject({
      origin: 'synced',
      payload: { name: 'Synced', body: 'synced body' },
    })
    expect(db.prepare('SELECT content FROM chunks').all()).toEqual([
      { content: 'synced body' },
    ])
  })
})
