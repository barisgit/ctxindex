import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSearchService, formatSearchResults } from './search-service'

let db: Database
const logger = { debug() {} } as unknown as Logger
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
  test('ranked results', () => {
    const service = createSearchService({ db, logger })

    const { results } = service.executeSearch({ query: 'alpha beta', limit: 5 })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.score).toBeGreaterThan(0)
    expect(results.map((result) => result.itemId)).toContain('item-alpha-title')
    expect(formatSearchResults(results)).toContain('source-local')
  })

  test('explain', () => {
    const service = createSearchService({ db, logger })

    const { results, explain } = service.executeSearch({
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
