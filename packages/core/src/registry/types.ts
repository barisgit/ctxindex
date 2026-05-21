import type { Logger } from '@ctxindex/core/logger'
import type { z } from 'zod'

export type AdapterProvider = 'google' | 'microsoft' | 'clickup' | 'local'
export type SyncMode = 'sync' | 'resync' | 'diff'
export type SourceKind = 'mailbox' | 'calendar' | 'directory' | 'tasks'

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

export interface SourceAdapterDefinition<TId extends string = string> {
  readonly id: TId
  readonly provider: AdapterProvider
  readonly label: string
  readonly schema: Readonly<Record<string, unknown>>
  readonly capabilities: AdapterCapabilities
  readonly migrations: AdapterMigrations
  readonly auth: AdapterAuthSpec
  readonly sync: SyncFunction
  readonly configSchema: z.ZodTypeAny
}
