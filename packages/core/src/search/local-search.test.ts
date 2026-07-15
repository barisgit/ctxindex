import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { createProfileRegistry } from '../registry/profile-registry'
import { ResourceStore } from '../resource/resource-store'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { LocalSearchExecutor } from './local-search'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const dbs: Database[] = []

const searchProfile = defineProfile({
  id: 'test.document',
  version: 1,
  schema: z.object({
    title: z.string(),
    occurredAt: z.date(),
    chunks: z.array(z.string()),
    text: z.string(),
    tags: z.array(z.string()),
    score: z.number(),
    scores: z.array(z.number()),
    active: z.boolean(),
    publishedAt: z.date(),
  }),
  search: {
    title: (payload) => payload.title,
    occurredAt: (payload) => payload.occurredAt,
    chunks: (payload) => payload.chunks,
    fields: {
      text: { type: 'string', extract: (payload) => payload.text },
      tags: { type: 'string[]', extract: (payload) => payload.tags },
      score: { type: 'number', extract: (payload) => payload.score },
      scores: { type: 'number[]', extract: (payload) => payload.scores },
      active: { type: 'boolean', extract: (payload) => payload.active },
      publishedAt: {
        type: 'datetime',
        extract: (payload) => payload.publishedAt,
      },
    },
  },
  docs: { summary: 'Test documents.', aliases: ['document', 'docs'] },
})

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal-id', 'personal', NULL, 1)")
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sourceId, 'personal-id', 'test', 1, '{}', 1, 1)
  dbs.push(db)
  return db
}

function payload(title: string, chunks: string[]) {
  return {
    title,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    chunks,
    text: 'exact',
    tags: ['one', 'two'],
    score: 7.5,
    scores: [3, 7.5],
    active: true,
    publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  }
}

function ref(suffix: string): string {
  return `ctx://${sourceId}/documents/${suffix}`
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('LocalSearchExecutor', () => {
  test('returns each Resource once in deterministic BM25 order with best chunk evidence', async () => {
    const db = await freshDb()
    const profiles = createProfileRegistry([searchProfile])
    const store = new ResourceStore(db, profiles)
    for (const suffix of ['c', 'a', 'b']) {
      store.upsert({
        ref: ref(suffix),
        sourceId,
        profile: { id: searchProfile.id, version: searchProfile.version },
        origin: suffix === 'b' ? 'adhoc' : 'synced',
        completeness: 'complete',
        summary: 'alpha summary',
        payload: payload('alpha title', [
          'alpha first matching chunk',
          'unrelated content',
          'alpha alpha strongest matching chunk',
        ]),
      })
    }

    const result = new LocalSearchExecutor(db, profiles).search({
      text: 'alpha',
      limit: 10,
    })

    expect(result.map((item) => item.ref)).toEqual([
      ref('a'),
      ref('b'),
      ref('c'),
    ])
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      origin: 'local',
      resourceOrigin: 'synced',
      envelope: { title: 'alpha title', summary: 'alpha summary' },
      evidence: { indexPaths: ['resources_fts', 'chunks_fts'] },
    })
    expect(result[0]?.chunks.map((chunk) => chunk.index)).toEqual([2, 0])
    expect(result[0]?.chunks[0]?.snippet).toContain('strongest matching')
  })

  test('normalizes exact Realm and Source filters while omission spans all values', async () => {
    const db = await freshDb()
    const companySource = '01ARZ3NDEKTSV4RRFFQ69G5FB0'
    db.exec("INSERT INTO realms VALUES ('company-id', 'company', NULL, 1)")
    db.prepare(
      'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(companySource, 'company-id', 'test', 1, '{}', 1, 1)
    const profiles = createProfileRegistry([searchProfile])
    const store = new ResourceStore(db, profiles)
    store.upsert({
      ref: ref('personal'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: payload('shared', ['shared']),
    })
    store.upsert({
      ref: `ctx://${companySource}/documents/company`,
      sourceId: companySource,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: payload('shared', ['shared']),
    })
    const search = new LocalSearchExecutor(db, profiles)

    expect(search.search({ text: 'shared' })).toHaveLength(2)
    expect(
      search
        .search({ text: 'shared', realms: [' personal ', 'personal'] })
        .map((item) => item.realm),
    ).toEqual(['personal'])
    expect(
      search
        .search({ text: 'shared', sourceIds: [` ${companySource} `] })
        .map((item) => item.sourceId),
    ).toEqual([companySource])
    expect(() =>
      search.search({ text: 'shared', realms: ['missing'] }),
    ).toThrow('Unknown Realm "missing"')
    expect(() =>
      search.search({ text: 'shared', sourceIds: ['missing'] }),
    ).toThrow('Unknown Source "missing"')
  })

  test('filters by kind aliases, occurredAt, and every V1 field type', async () => {
    const db = await freshDb()
    const profiles = createProfileRegistry([searchProfile])
    const store = new ResourceStore(db, profiles)
    store.upsert({
      ref: ref('match'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: payload('match', ['body']),
    })
    store.upsert({
      ref: ref('other'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        ...payload('other', ['body']),
        text: 'other',
        tags: ['other'],
        score: 1,
        scores: [1, 2],
        active: false,
        occurredAt: new Date('2025-01-01T00:00:00.000Z'),
        publishedAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    })
    const search = new LocalSearchExecutor(db, profiles)
    const filters = [
      { name: 'text', value: ' exact ' },
      { name: 'tags', value: 'two' },
      { name: 'score', value: '7.5' },
      { name: 'scores', value: '3' },
      { name: 'active', value: 'true' },
      { name: 'publishedAt', value: '2026-01-02T00:00:00.000Z' },
    ]

    expect(
      search
        .search({
          text: '',
          kind: ' DOCS ',
          fields: filters,
          since: Date.parse('2026-01-01T00:00:00.000Z'),
          until: Date.parse('2026-01-01T00:00:00.000Z'),
        })
        .map((item) => ({ ref: item.ref, paths: item.evidence.indexPaths })),
    ).toEqual([{ ref: ref('match'), paths: ['field_index'] }])
  })

  test('rejects invalid Profile-derived field queries deterministically before FTS execution', async () => {
    const db = await freshDb()
    const conflictingVersion = defineProfile({
      ...searchProfile,
      version: 2,
      search: {
        ...searchProfile.search,
        fields: {
          ...searchProfile.search?.fields,
          text: { type: 'number', extract: () => 1 },
        },
      },
    })
    const collidingProfile = defineProfile({
      id: 'other.document',
      version: 1,
      schema: z.object({}),
      docs: { summary: 'Other.', aliases: ['docs'] },
    })
    const base = new LocalSearchExecutor(
      db,
      createProfileRegistry([searchProfile]),
    )
    const conflicting = new LocalSearchExecutor(
      db,
      createProfileRegistry([searchProfile, conflictingVersion]),
    )
    const ambiguous = new LocalSearchExecutor(
      db,
      createProfileRegistry([searchProfile, collidingProfile]),
    )
    const invalidQueries = [
      () =>
        base.search({
          text: '" hostile',
          fields: [{ name: 'text', value: 'x' }],
        }),
      () => base.search({ text: '" hostile', kind: 'missing' }),
      () => ambiguous.search({ text: '" hostile', kind: 'docs' }),
      () =>
        base.search({
          text: '" hostile',
          kind: 'document',
          fields: [{ name: 'missing', value: 'x' }],
        }),
      () =>
        conflicting.search({
          text: '" hostile',
          kind: 'test.document',
          fields: [{ name: 'text', value: '1' }],
        }),
      () =>
        base.search({
          text: '" hostile',
          kind: 'document',
          fields: [{ name: 'text', value: '   ' }],
        }),
      () =>
        base.search({
          text: '" hostile',
          kind: 'document',
          fields: [{ name: 'score', value: 'NaN' }],
        }),
      () =>
        base.search({
          text: '" hostile',
          kind: 'document',
          fields: [{ name: 'active', value: 'yes' }],
        }),
      () =>
        base.search({
          text: '" hostile',
          kind: 'document',
          fields: [{ name: 'publishedAt', value: 'not-a-date' }],
        }),
    ]

    for (const execute of invalidQueries) {
      try {
        execute()
        throw new Error('expected invalid query to throw')
      } catch (error) {
        expect(error).toMatchObject({ code: 'invalid_filter' })
      }
    }
  })

  test('supports tombstone states, ad-hoc envelope matches, hostile input, and relaxed fallback', async () => {
    const db = await freshDb()
    const profiles = createProfileRegistry([searchProfile])
    const store = new ResourceStore(db, profiles)
    store.upsert({
      ref: ref('deleted'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      summary: 'retained summary',
      payload: payload('deleted title', ['deleted body']),
    })
    store.remove({ ref: ref('deleted'), sourceId, deletedAt: 123 })
    store.upsert({
      ref: ref('adhoc'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: payload('adhoc needle', ['unrelated']),
    })
    store.upsert({
      ref: ref('prefix'),
      sourceId,
      profile: { id: 'test.document', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: payload('alphabet soup', ['unrelated']),
    })
    const search = new LocalSearchExecutor(db, profiles)

    expect(search.search({ text: '' }).map((item) => item.ref)).toEqual([
      ref('adhoc'),
      ref('prefix'),
    ])
    expect(
      search.search({ text: '', deleted: 'include' }).map((item) => item.ref),
    ).toEqual([ref('adhoc'), ref('deleted'), ref('prefix')])
    expect(
      search.search({ text: '', deleted: 'only' }).map((item) => item.ref),
    ).toEqual([ref('deleted')])
    expect(search.search({ text: 'deleted' })).toEqual([])
    expect(
      search
        .search({ text: 'deleted', deleted: 'include' })
        .map((item) => item.ref),
    ).toEqual([ref('deleted')])
    expect(
      search
        .search({ text: 'deleted', deleted: 'only' })
        .map((item) => item.ref),
    ).toEqual([ref('deleted')])
    expect(
      search
        .search({ text: 'retained', deleted: 'only' })
        .map((item) => item.ref),
    ).toEqual([ref('deleted')])
    expect(search.search({ text: 'missing', deleted: 'only' })).toEqual([])
    expect(
      search.search({ text: 'body', deleted: 'only' }).map((item) => item.ref),
    ).toEqual([ref('deleted')])
    expect(search.search({ text: 'needle' })).toMatchObject([
      {
        ref: ref('adhoc'),
        resourceOrigin: 'adhoc',
        evidence: { indexPaths: ['resources_fts'] },
      },
    ])
    expect(search.search({ text: 'alpha' }).map((item) => item.ref)).toEqual([
      ref('prefix'),
    ])
    expect(() => search.search({ text: '"()[]{}^*?!~' })).not.toThrow()
  })
})
