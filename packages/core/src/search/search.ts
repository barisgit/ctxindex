import type { CtxindexDatabase } from '../storage/db'
import { sanitizeQuery } from './sanitize'
import type {
  ExplainInfo,
  SearchOptions,
  SearchResult,
  SearchResultChunk,
} from './types'

interface RawItem {
  id: string
  source_id: string
  adapter_id: string
  realm_id: string
  kind: string
  uri: string
  title: string | null
  indexed_at: number
  updated_at: number
  deleted_at: number | null
  realm_slug: string
}

interface FtsItemRow {
  item_id: string
  rank: number
}

interface FtsChunkRow {
  chunk_id: string
  item_id: string
  rank: number
  content: string
}

function buildItemFilter(
  filters: NonNullable<SearchOptions['filters']>,
  params: unknown[],
): string {
  const clauses: string[] = []

  if (filters.realms && filters.realms.length > 0) {
    const slugs = [...filters.realms]
    if (!filters.noGlobal && !filters.realmOnly) {
      if (!slugs.includes('global')) slugs.push('global')
    }
    const ph = slugs.map(() => '?').join(', ')
    clauses.push(`i.realm_id IN (SELECT id FROM realms WHERE slug IN (${ph}))`)
    params.push(...slugs)
  }

  if (filters.sources && filters.sources.length > 0) {
    const ph = filters.sources.map(() => '?').join(', ')
    clauses.push(`i.source_id IN (${ph})`)
    params.push(...filters.sources)
  }

  if (filters.adapters && filters.adapters.length > 0) {
    const ph = filters.adapters.map(() => '?').join(', ')
    clauses.push(`i.adapter_id IN (${ph})`)
    params.push(...filters.adapters)
  }

  if (filters.kinds && filters.kinds.length > 0) {
    const ph = filters.kinds.map(() => '?').join(', ')
    clauses.push(`i.kind IN (${ph})`)
    params.push(...filters.kinds)
  }

  if (filters.since != null) {
    clauses.push('i.indexed_at >= ?')
    params.push(filters.since)
  }

  if (filters.until != null) {
    clauses.push('i.indexed_at <= ?')
    params.push(filters.until)
  }

  if (!filters.includeDeleted) {
    clauses.push('i.deleted_at IS NULL')
  }

  return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : ''
}

function fetchItem(db: CtxindexDatabase, itemId: string): RawItem | null {
  return db
    .prepare(
      `SELECT i.id, i.source_id, i.adapter_id, i.realm_id, i.kind, i.uri,
              i.title, i.indexed_at, i.updated_at, i.deleted_at,
              r.slug AS realm_slug
       FROM items i
       JOIN realms r ON r.id = i.realm_id
       WHERE i.id = ?`,
    )
    .get(itemId) as RawItem | null
}

function getBestChunk(
  db: CtxindexDatabase,
  itemId: string,
  chunkId?: string,
): SearchResultChunk | null {
  const row = chunkId
    ? (db
        .prepare(
          'SELECT id, chunk_index, content FROM item_chunks WHERE id = ? AND item_id = ?',
        )
        .get(chunkId, itemId) as {
        id: string
        chunk_index: number
        content: string
      } | null)
    : (db
        .prepare(
          'SELECT id, chunk_index, content FROM item_chunks WHERE item_id = ? ORDER BY chunk_index LIMIT 1',
        )
        .get(itemId) as {
        id: string
        chunk_index: number
        content: string
      } | null)

  if (!row) return null
  return {
    chunkId: row.id,
    chunkIndex: row.chunk_index,
    snippet: row.content.slice(0, 200),
  }
}

function runItemFts(
  db: CtxindexDatabase,
  matchExpr: string,
  filters: NonNullable<SearchOptions['filters']>,
  limit: number,
): FtsItemRow[] {
  const params: unknown[] = [matchExpr]
  const filterClause = buildItemFilter(filters, params)
  const sql = `
    SELECT i.id AS item_id, f.rank
    FROM items_fts f
    JOIN items i ON i.rowid = f.rowid
    JOIN realms r ON r.id = i.realm_id
    WHERE items_fts MATCH ?
    ${filterClause}
    ORDER BY f.rank
    LIMIT ${limit}
  `
  try {
    return db.prepare(sql).all(...(params as string[])) as FtsItemRow[]
  } catch {
    return []
  }
}

function runChunkFts(
  db: CtxindexDatabase,
  matchExpr: string,
  filters: NonNullable<SearchOptions['filters']>,
  limit: number,
): FtsChunkRow[] {
  const params: unknown[] = [matchExpr]
  const filterClause = buildItemFilter(filters, params)
  const sql = `
    SELECT ic.id AS chunk_id, ic.item_id, f.rank, ic.content
    FROM chunks_fts f
    JOIN item_chunks ic ON ic.rowid = f.rowid
    JOIN items i ON i.id = ic.item_id
    JOIN realms r ON r.id = i.realm_id
    WHERE chunks_fts MATCH ?
    ${filterClause}
    ORDER BY f.rank
    LIMIT ${limit}
  `
  try {
    return db.prepare(sql).all(...(params as string[])) as FtsChunkRow[]
  } catch {
    return []
  }
}

function passesFilters(
  item: RawItem,
  filters: NonNullable<SearchOptions['filters']>,
): boolean {
  if (!filters.includeDeleted && item.deleted_at != null) return false
  return true
}

export function search(
  db: CtxindexDatabase,
  options: SearchOptions,
): SearchResult[] {
  const { query, filters = {}, limit = 20, explain = false } = options
  const { strict, relaxed } = sanitizeQuery(query)

  let itemResults = runItemFts(db, strict, filters, limit)
  let chunkResults = runChunkFts(db, strict, filters, limit)

  if (
    itemResults.length === 0 &&
    chunkResults.length === 0 &&
    strict !== relaxed
  ) {
    itemResults = runItemFts(db, relaxed, filters, limit)
    chunkResults = runChunkFts(db, relaxed, filters, limit)
  }

  const itemScores = new Map<
    string,
    { itemRank: number; chunkRank: number | null; chunkId: string | null }
  >()

  itemResults.forEach((r, idx) => {
    itemScores.set(r.item_id, { itemRank: idx, chunkRank: null, chunkId: null })
  })

  chunkResults.forEach((r, idx) => {
    const existing = itemScores.get(r.item_id)
    if (existing) {
      if (existing.chunkRank == null) {
        existing.chunkRank = idx
        existing.chunkId = r.chunk_id
      }
    } else {
      itemScores.set(r.item_id, {
        itemRank: -1,
        chunkRank: idx,
        chunkId: r.chunk_id,
      })
    }
  })

  const scored = Array.from(itemScores.entries()).map(([itemId, ranks]) => {
    let score = 0
    let matchedFrom: SearchResult['matchedFrom'] = 'both'
    if (ranks.itemRank >= 0 && ranks.chunkRank == null) {
      score = 1 / (60 + ranks.itemRank)
      matchedFrom = 'items_fts'
    } else if (ranks.itemRank < 0 && ranks.chunkRank != null) {
      score = 1 / (60 + ranks.chunkRank)
      matchedFrom = 'chunks_fts'
    } else {
      score = 1 / (60 + ranks.itemRank) + 1 / (60 + (ranks.chunkRank ?? 0))
      matchedFrom = 'both'
    }
    return { itemId, score, matchedFrom, chunkId: ranks.chunkId }
  })

  scored.sort((a, b) => b.score - a.score)

  const results: SearchResult[] = []

  for (const { itemId, score, matchedFrom, chunkId } of scored.slice(
    0,
    limit,
  )) {
    const item = fetchItem(db, itemId)
    if (!item) continue
    if (!passesFilters(item, filters)) continue

    const bestChunk = getBestChunk(db, itemId, chunkId ?? undefined)

    let explainInfo: ExplainInfo | undefined
    if (explain) {
      const chunkIds = chunkResults
        .filter((r) => r.item_id === itemId)
        .map((r) => r.chunk_id)
      explainInfo = {
        matchedFrom,
        itemFtsRank:
          itemResults.findIndex((r) => r.item_id === itemId) >= 0
            ? itemResults.findIndex((r) => r.item_id === itemId)
            : null,
        chunkFtsRank:
          chunkResults.findIndex((r) => r.item_id === itemId) >= 0
            ? chunkResults.findIndex((r) => r.item_id === itemId)
            : null,
        fusedScore: score,
        matchedChunkIds: chunkIds,
        snippets: chunkIds
          .slice(0, 3)
          .map((cid) => getBestChunk(db, itemId, cid)?.snippet ?? ''),
      }
    }

    const result: SearchResult = {
      itemId: item.id,
      sourceId: item.source_id,
      adapterId: item.adapter_id,
      realmId: item.realm_id,
      kind: item.kind,
      uri: item.uri,
      title: item.title,
      indexedAt: item.indexed_at,
      updatedAt: item.updated_at,
      deletedAt: item.deleted_at,
      score,
      matchedFrom,
      bestChunk,
    }
    if (explain && explainInfo) result.explain = explainInfo
    results.push(result)
  }

  return results
}
