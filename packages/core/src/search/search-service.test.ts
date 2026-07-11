import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import type { AdapterSearchFunction } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import {
  createSearchService,
  formatSearchResults,
  type SearchPlannerRegistry,
} from './search-service'

let db: Database
const logger = { debug() {}, warn() {} } as unknown as Logger
const now = Date.now()

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  seedSearchFixtures(db)
})

afterEach(() => {
  db.close()
})

function insertItem(
  db: Database,
  input: { id: string; title: string; content: string },
): void {
  db.prepare(
    `INSERT INTO items
       (id, source_id, realm_id, adapter_id, kind, uri, title, indexed_at, updated_at)
     VALUES (?, 'source-local', 'global', 'local.directory', 'text/markdown', ?, ?, ?, ?)`,
  ).run(input.id, `file:///${input.id}.md`, input.title, now, now)
  db.prepare(
    `INSERT INTO item_chunks (id, item_id, chunk_index, content, created_at)
     VALUES (?, ?, 0, ?, ?)`,
  ).run(`${input.id}-chunk`, input.id, input.content, now)
}

function seedSearchFixtures(db: Database): void {
  db.prepare(
    `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
     VALUES ('source-local', 'global', 'local.directory', 'Local', NULL, ?)`,
  ).run(now)

  insertItem(db, {
    id: 'item-alpha-title',
    title: 'Alpha beta architecture notes',
    content: 'Architecture notes mention beta once.',
  })
  insertItem(db, {
    id: 'item-alpha-chunk',
    title: 'Gamma notes',
    content: 'Alpha beta search content with alpha beta repeated.',
  })
}

describe('search service', () => {
  test('ranked results', async () => {
    const service = createSearchService({ db, logger })

    const { results } = await service.executeSearch({
      query: 'alpha beta',
      limit: 5,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.score).toBeGreaterThan(0)
    expect(results.map((result) => result.itemId)).toContain('item-alpha-title')
    expect(formatSearchResults(results)).toContain('source-local')
  })

  test('planner merges provider results with local results', async () => {
    db.prepare(
      `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
       VALUES ('source-gmail', 'global', 'google.mailbox', 'Gmail', NULL, ?)`,
    ).run(now)
    const providerSearch: AdapterSearchFunction = async () => [
      {
        externalId: 'msg-1',
        title: 'Alpha beta mail thread',
        snippet: 'alpha beta discussed in mail',
        timestamp: now,
        rank: 0,
      },
    ]
    const registry: SearchPlannerRegistry = {
      isKnownAdapter: (id) => id === 'google.mailbox',
      getSearchMode: () => 'hybrid',
      getSearchFn: () => providerSearch,
    }
    const service = createSearchService({ db, logger, registry })

    const { results, warnings } = await service.executeSearch({
      query: 'alpha beta',
      limit: 10,
      explain: true,
    })

    expect(warnings).toBeUndefined()
    const providerResults = results.filter((r) => r.origin === 'provider')
    const localResults = results.filter((r) => r.origin === 'local_fts')
    expect(providerResults).toHaveLength(1)
    expect(localResults.length).toBeGreaterThan(0)
    expect(providerResults[0]?.sourceId).toBe('source-gmail')
    expect(providerResults[0]?.title).toBe('Alpha beta mail thread')
    expect(providerResults[0]?.explain?.origin).toBe('provider')
    expect(providerResults[0]?.explain?.providerRank).toBe(0)
    // Materialized metadata-only item resolves via external_refs on repeat:
    // it is now locally indexed, so dedupe keeps the local entry with the same id.
    const again = await service.executeSearch({
      query: 'alpha beta',
      limit: 10,
    })
    const repeat = again.results.filter(
      (r) => r.itemId === (providerResults[0]?.itemId as string),
    )
    expect(repeat).toHaveLength(1)
  })

  test('planner degrades to local results when provider search fails', async () => {
    db.prepare(
      `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
       VALUES ('source-gmail', 'global', 'google.mailbox', 'Gmail', NULL, ?)`,
    ).run(now)
    const registry: SearchPlannerRegistry = {
      isKnownAdapter: (id) => id === 'google.mailbox',
      getSearchMode: () => 'hybrid',
      getSearchFn: () => async () => {
        throw Object.assign(new Error('offline'), { code: 'network' })
      },
    }
    const service = createSearchService({ db, logger, registry })

    const { results, warnings } = await service.executeSearch({
      query: 'alpha beta',
      limit: 10,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.origin === 'local_fts')).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings?.[0]).toMatchObject({
      sourceId: 'source-gmail',
      code: 'network',
    })
  })

  test('localOnly skips provider fan-out', async () => {
    db.prepare(
      `INSERT INTO sources (id, realm_id, adapter_id, display_name, config_json, created_at)
       VALUES ('source-gmail', 'global', 'google.mailbox', 'Gmail', NULL, ?)`,
    ).run(now)
    let called = false
    const registry: SearchPlannerRegistry = {
      isKnownAdapter: (id) => id === 'google.mailbox',
      getSearchMode: () => 'hybrid',
      getSearchFn: () => async () => {
        called = true
        return []
      },
    }
    const service = createSearchService({ db, logger, registry })

    const { results } = await service.executeSearch({
      query: 'alpha beta',
      limit: 10,
      localOnly: true,
    })

    expect(called).toBe(false)
    expect(results.every((r) => r.origin === 'local_fts')).toBe(true)
  })

  test('explain', async () => {
    const service = createSearchService({ db, logger })

    const { results, explain } = await service.executeSearch({
      query: 'alpha beta',
      explain: true,
      limit: 5,
    })

    expect(results.length).toBeGreaterThan(0)
    expect(explain?.length).toBe(results.length)
    expect(explain?.[0]).toEqual(
      expect.objectContaining({
        itemId: expect.any(String),
        fusedScore: expect.any(Number),
      }),
    )
  })
})
