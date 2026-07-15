import type { ResourceOrigin } from '../resource/resource-store'

export interface LocalSearchFieldFilter {
  readonly name: string
  readonly value: string
}

export interface LocalSearchQuery {
  readonly text: string
  readonly limit?: number
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
  readonly deleted?: 'exclude' | 'include' | 'only'
}

export interface LocalSearchChunk {
  readonly index: number
  readonly snippet: string
  readonly rank: number
}

export interface LocalSearchEvidence {
  readonly rank: number
  readonly indexPaths: readonly (
    | 'resources'
    | 'resources_fts'
    | 'chunks_fts'
    | 'field_index'
  )[]
}

export interface LocalSearchResult {
  readonly origin: 'local'
  readonly resourceOrigin: ResourceOrigin
  readonly ref: string
  readonly sourceId: string
  readonly realm: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly envelope: {
    readonly title: string | null
    readonly summary: string | null
    readonly occurredAt: number | null
    readonly deletedAt: number | null
  }
  readonly evidence: LocalSearchEvidence
  readonly chunks: readonly LocalSearchChunk[]
}
