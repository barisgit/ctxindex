import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { search } from './search'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let db: Database

const REALM_GLOBAL = 'global'
const REALM_WORK = 'realm-work-01'
const SOURCE_LOCAL = 'src-local-01'
const SOURCE_GMAIL = 'src-gmail-01'

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  seedFixtures(db)
})

afterEach(() => {
  try {
    db.close()
  } catch {
    /* ignore */
  }
})

function seedFixtures(db: Database): void {
  const now = Date.now()

  // Work realm
  db.prepare(
    `INSERT INTO realms (id, slug, is_default, created_at) VALUES (?, ?, 0, ?)`,
  ).run(REALM_WORK, 'work', now)

  // Sources
  db.prepare(
    `INSERT INTO sources (id, realm_id, adapter_id, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(SOURCE_LOCAL, REALM_GLOBAL, 'local.directory', 'Local Dir', now)

  db.prepare(
    `INSERT INTO sources (id, realm_id, adapter_id, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(SOURCE_GMAIL, REALM_WORK, 'google.mailbox', 'Gmail', now)

  // 20 directory items in global realm
  for (let i = 0; i < 20; i++) {
    const id = `item-local-${String(i).padStart(3, '0')}`
    const indexedAt = now - i * 1000
    db.prepare(
      `INSERT INTO items
         (id, source_id, realm_id, adapter_id, kind, uri, title, indexed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      SOURCE_LOCAL,
      REALM_GLOBAL,
      'local.directory',
      'directory',
      `file:///docs/file${i}.md`,
      `Document about typescript patterns ${i}`,
      indexedAt,
      now,
    )
    db.prepare(
      `INSERT INTO item_chunks (id, item_id, chunk_index, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      `chunk-local-${i}-0`,
      id,
      0,
      `TypeScript pattern number ${i}: generic constraints and conditional types`,
      now,
    )
    if (i % 3 === 0) {
      db.prepare(
        `INSERT INTO item_chunks (id, item_id, chunk_index, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        `chunk-local-${i}-1`,
        id,
        1,
        `Advanced usage of mapped types in TypeScript for item ${i}`,
        now,
      )
    }
  }

  // 12 mailbox items in work realm
  for (let i = 0; i < 12; i++) {
    const id = `item-gmail-${String(i).padStart(3, '0')}`
    db.prepare(
      `INSERT INTO items
         (id, source_id, realm_id, adapter_id, kind, uri, title, indexed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      SOURCE_GMAIL,
      REALM_WORK,
      'google.mailbox',
      'mailbox',
      `gmail://message/${i}`,
      `Email about project meeting ${i}`,
      now - i * 2000,
      now,
    )
    db.prepare(
      `INSERT INTO item_chunks (id, item_id, chunk_index, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      `chunk-gmail-${i}-0`,
      id,
      0,
      `Meeting agenda for sprint planning session ${i}: review backlog and estimates`,
      now,
    )
  }

  // 3 tombstoned items in global realm
  for (let i = 0; i < 3; i++) {
    const id = `item-deleted-${i}`
    db.prepare(
      `INSERT INTO items
         (id, source_id, realm_id, adapter_id, kind, uri, title,
          indexed_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      SOURCE_LOCAL,
      REALM_GLOBAL,
      'local.directory',
      'directory',
      `file:///deleted/file${i}.md`,
      `Deleted document typescript obsolete ${i}`,
      now - 50000,
      now,
      now - 1000,
    )
    db.prepare(
      `INSERT INTO tombstones (id, item_id, source_id, deleted_at)
       VALUES (?, ?, ?, ?)`,
    ).run(`tomb-${i}`, id, SOURCE_LOCAL, now - 1000)
    db.prepare(
      `INSERT INTO item_chunks (id, item_id, chunk_index, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      `chunk-deleted-${i}-0`,
      id,
      0,
      `Obsolete typescript content that was deleted ${i}`,
      now,
    )
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('search – basic ranking', () => {
  test('returns BM25-ranked results for a broad query', async () => {
    const results = search(db, { query: 'typescript', limit: 10 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(10)
    // Results must have a positive score (RRF score > 0)
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0)
    }
  })

  test('tombstoned items excluded by default', async () => {
    const results = search(db, { query: 'typescript obsolete', limit: 50 })
    for (const r of results) {
      expect(r.itemId).not.toMatch(/^item-deleted-/)
    }
  })

  test('tombstoned items included with includeDeleted: true', async () => {
    const results = search(db, {
      query: 'obsolete',
      limit: 50,
      filters: { includeDeleted: true },
    })
    const ids = results.map((r) => r.itemId)
    const hasDeleted = ids.some((id) => id.startsWith('item-deleted-'))
    expect(hasDeleted).toBe(true)
  })
})

describe('search – realm filter', () => {
  test('global realm implicitly included when other realms specified', async () => {
    const results = search(db, {
      query: 'typescript',
      limit: 30,
      filters: { realms: ['work'] },
    })
    // Typescript items are in global realm — should appear
    const globalItems = results.filter((r) => r.realmId === REALM_GLOBAL)
    expect(globalItems.length).toBeGreaterThan(0)
  })

  test('realmOnly=true excludes global when not listed', async () => {
    const results = search(db, {
      query: 'typescript',
      limit: 30,
      filters: { realms: ['work'], realmOnly: true },
    })
    // Only work realm items
    for (const r of results) {
      expect(r.realmId).toBe(REALM_WORK)
    }
  })

  test('no realm filter returns results from all realms', async () => {
    const results = search(db, { query: 'meeting', limit: 20 })
    expect(results.length).toBeGreaterThan(0)
  })
})

describe('search – source filter', () => {
  test('restricts to the given source', async () => {
    const results = search(db, {
      query: 'typescript',
      limit: 20,
      filters: { sources: [SOURCE_LOCAL] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.sourceId).toBe(SOURCE_LOCAL)
    }
  })
})

describe('search – adapter filter', () => {
  test('--adapter local.directory returns only directory items', async () => {
    const results = search(db, {
      query: 'document',
      limit: 20,
      filters: { adapters: ['local.directory'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.adapterId).toBe('local.directory')
    }
  })

  test('--adapter google.mailbox returns only mailbox items', async () => {
    const results = search(db, {
      query: 'meeting',
      limit: 20,
      filters: { adapters: ['google.mailbox'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.adapterId).toBe('google.mailbox')
    }
  })
})

describe('search – provider-module filter', () => {
  test('--provider google matches the google.mailbox adapter prefix', async () => {
    const results = search(db, {
      query: 'meeting',
      limit: 20,
      filters: { providers: ['google'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.adapterId).toBe('google.mailbox')
    }
  })

  test('--provider local matches the local.directory adapter prefix', async () => {
    const results = search(db, {
      query: 'document',
      limit: 20,
      filters: { providers: ['local'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.adapterId).toBe('local.directory')
    }
  })

  test('--provider with no matching module returns nothing', async () => {
    const results = search(db, {
      query: 'document',
      limit: 20,
      filters: { providers: ['microsoft'] },
    })
    expect(results).toHaveLength(0)
  })
})

describe('search – kind filter', () => {
  test('--kind directory returns only directory items', async () => {
    const results = search(db, {
      query: 'typescript',
      limit: 20,
      filters: { kinds: ['directory'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.kind).toBe('directory')
    }
  })

  test('--kind mailbox returns only mailbox items', async () => {
    const results = search(db, {
      query: 'meeting',
      limit: 20,
      filters: { kinds: ['mailbox'] },
    })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.kind).toBe('mailbox')
    }
  })
})

describe('search – since/until filter', () => {
  test('--since filters out older items', async () => {
    const cutoff = Date.now() - 5000
    const results = search(db, {
      query: 'typescript',
      limit: 30,
      filters: { since: cutoff },
    })
    for (const r of results) {
      expect(r.indexedAt).toBeGreaterThanOrEqual(cutoff)
    }
  })

  test('--until filters out newer items', async () => {
    const cutoff = Date.now() - 15000
    const results = search(db, {
      query: 'typescript',
      limit: 30,
      filters: { until: cutoff },
    })
    for (const r of results) {
      expect(r.indexedAt).toBeLessThanOrEqual(cutoff)
    }
  })
})

describe('search – relaxed query fallback', () => {
  test('falls back to prefix query for partial terms', async () => {
    // 'typescri' won't exact-match, but 'typescri*' prefix will
    const results = search(db, { query: 'typescri', limit: 10 })
    expect(results.length).toBeGreaterThan(0)
  })

  test('empty / all-punctuation query returns empty', async () => {
    const results = search(db, { query: '!!!###', limit: 10 })
    expect(results).toEqual([])
  })
})

describe('search – explain flag', () => {
  test('--explain includes explain block', async () => {
    const results = search(db, { query: 'typescript', limit: 5, explain: true })
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.explain).toBeDefined()
      if (!r.explain) {
        throw new Error('expected explain block')
      }
      expect(['items_fts', 'chunks_fts', 'both']).toContain(
        r.explain.matchedFrom,
      )
      expect(typeof r.explain.fusedScore).toBe('number')
      expect(Array.isArray(r.explain.matchedChunkIds)).toBe(true)
    }
  })
})

describe('search – best chunk snippet', () => {
  test('each result includes a best-chunk snippet when chunks exist', async () => {
    const results = search(db, { query: 'typescript', limit: 5 })
    const withChunk = results.filter((r) => r.bestChunk !== null)
    expect(withChunk.length).toBeGreaterThan(0)
    for (const r of withChunk) {
      expect(r.bestChunk?.snippet.length).toBeGreaterThan(0)
      expect(typeof r.bestChunk?.chunkIndex).toBe('number')
    }
  })
})

describe('search – combined filters', () => {
  test('adapter + kind combination', async () => {
    const results = search(db, {
      query: 'document typescript',
      limit: 20,
      filters: {
        adapters: ['local.directory'],
        kinds: ['directory'],
      },
    })
    for (const r of results) {
      expect(r.adapterId).toBe('local.directory')
      expect(r.kind).toBe('directory')
    }
  })

  test('realm + source + realmOnly combination', async () => {
    const results = search(db, {
      query: 'meeting sprint',
      limit: 20,
      filters: {
        realms: ['work'],
        sources: [SOURCE_GMAIL],
        realmOnly: true,
      },
    })
    for (const r of results) {
      expect(r.realmId).toBe(REALM_WORK)
      expect(r.sourceId).toBe(SOURCE_GMAIL)
    }
  })
})
