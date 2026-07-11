import type { Logger } from '@ctxindex/core/logger'
import type { z } from 'zod'

export type AdapterProvider = 'google' | 'microsoft' | 'clickup' | 'local'
export type SyncMode = 'sync' | 'resync' | 'diff'
export type SourceKind = 'mailbox' | 'calendar' | 'directory' | 'tasks'
// SPEC §10e
export type AdapterSearchMode = 'indexed' | 'federated' | 'hybrid'

export interface AdapterMigrations {
  readonly namespace: string
  readonly migrationsFolder: string
  readonly migrationsTable: string
}

export interface AdapterCapabilities {
  readonly kinds: readonly [SourceKind, ...SourceKind[]]
  readonly modes: readonly [SyncMode, ...SyncMode[]]
  readonly supportsResume: boolean
  readonly supportsAttachments: boolean
  readonly supportsRawRecords: boolean
  readonly supportsRealm: true
}

export type AdapterAuthSpec =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'oauth2'
      readonly provider: 'google' | 'microsoft'
      readonly scopes: readonly string[]
      readonly clientIdRef: string
      readonly clientSecretRef?: string
    }

export interface SyncContext {
  readonly sourceId: string
  readonly runId: string
  readonly mode: SyncMode
  readonly cursor: unknown | null
  readonly logger: Logger
  readonly signal: AbortSignal
}

export type SyncOperation = {
  readonly type: string
  readonly [key: string]: unknown
}

export type SyncFunction = (ctx: SyncContext) => AsyncIterable<SyncOperation>

// SPEC §10e — provider-side search capability (required for federated/hybrid)
export interface AdapterSearchContext {
  readonly sourceId: string
  readonly config: unknown
  readonly logger: Logger
  readonly signal: AbortSignal
}

export interface AdapterSearchQuery {
  readonly text: string
  readonly since?: number
  readonly until?: number
  readonly kinds?: readonly string[]
  readonly limit: number
}

export interface AdapterSearchResult {
  readonly externalId: string
  readonly uri?: string
  readonly title: string
  readonly snippet?: string
  readonly timestamp?: number
  readonly rank: number
  readonly metadata?: Readonly<Record<string, unknown>>
}

export type AdapterSearchFunction = (
  ctx: AdapterSearchContext,
  query: AdapterSearchQuery,
) => Promise<readonly AdapterSearchResult[]>

export interface SourceAdapterDefinition<TId extends string = string> {
  readonly id: TId
  readonly provider: AdapterProvider
  readonly label: string
  readonly schema: Readonly<Record<string, unknown>>
  readonly capabilities: AdapterCapabilities
  readonly migrations: AdapterMigrations
  readonly auth: AdapterAuthSpec
  readonly sync: SyncFunction
  readonly searchMode: AdapterSearchMode
  readonly search?: AdapterSearchFunction
  readonly configSchema: z.ZodTypeAny
}
