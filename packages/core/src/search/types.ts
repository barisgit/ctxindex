export interface SearchFilters {
  /** Realm slugs to include. Global realm is always added unless noGlobal=true. */
  realms?: string[]
  /** Restrict to specific source IDs. */
  sources?: string[]
  /** Restrict to specific adapter IDs. */
  adapters?: string[]
  /** Restrict to provider modules (the adapter-id prefix, e.g. "google"). */
  providers?: string[]
  /** Restrict to item kinds. */
  kinds?: string[]
  /** Only items with indexed_at >= since (ms epoch). */
  since?: number
  /** Only items with indexed_at <= until (ms epoch). */
  until?: number
  /** Include tombstoned items. Default: false. */
  includeDeleted?: boolean
  /** Exclude global realm even if other realms are specified. */
  noGlobal?: boolean
  /** Only search the exact set of realms given, no global auto-include. */
  realmOnly?: boolean
}

export interface SearchResultChunk {
  chunkId: string
  chunkIndex: number
  snippet: string
}

export type SearchResultOrigin = 'local_fts' | 'provider'

export interface SearchResult {
  itemId: string
  sourceId: string
  adapterId: string
  realmId: string
  kind: string
  uri: string
  title: string | null
  indexedAt: number
  updatedAt: number
  deletedAt: number | null
  score: number
  origin: SearchResultOrigin
  matchedFrom: 'items_fts' | 'chunks_fts' | 'both'
  bestChunk: SearchResultChunk | null
  explain?: ExplainInfo
}

export interface SearchWarning {
  sourceId: string
  adapterId: string
  code: string
  message: string
}

export interface ExplainInfo {
  origin?: SearchResultOrigin
  providerRank?: number
  matchedFrom: 'items_fts' | 'chunks_fts' | 'both'
  itemFtsRank: number | null
  chunkFtsRank: number | null
  fusedScore: number
  matchedChunkIds: string[]
  snippets: string[]
}

export interface SearchOptions {
  query: string
  filters?: SearchFilters
  limit?: number
  snippetChars?: number
  explain?: boolean
}
