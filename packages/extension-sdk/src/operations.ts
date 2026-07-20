import type {
  ArtifactDescriptor,
  FieldType,
  ResolvedArtifactDescriptor,
} from './profile'

interface ResourceProfileIdentity {
  readonly id: string
  readonly version: number
}

export interface AdapterSourceContext {
  readonly id: string
  readonly config: unknown
}

export interface AdapterLogger {
  trace(data: unknown, message?: string): void
  debug(data: unknown, message?: string): void
  info(data: unknown, message?: string): void
  warn(data: unknown, message?: string): void
  error(data: unknown, message?: string): void
}

interface ProviderContext {
  readonly source: AdapterSourceContext
  readonly fetch: typeof fetch
  readonly logger: AdapterLogger
}

export type SyncMode = 'sync' | 'resync' | 'diff'

export interface RetrievedResource<TPayload = unknown> {
  readonly ref: string
  readonly profile: ResourceProfileIdentity
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload: TPayload
}

export interface SyncedResource<TPayload = unknown>
  extends RetrievedResource<TPayload> {
  readonly completeness: 'partial' | 'complete'
}

export type SyncEmission =
  | { readonly type: 'upsertResource'; readonly resource: SyncedResource }
  | { readonly type: 'removeResource'; readonly ref: string }
  | { readonly type: 'checkpoint'; readonly cursor: unknown }
  | {
      readonly type: 'warning'
      readonly code: string
      readonly message: string
      readonly ref?: string
    }

export interface SyncContext extends ProviderContext {
  readonly cursor: unknown | null
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly emit: (operation: SyncEmission) => void | Promise<void>
}

export interface SearchRemoteQuery {
  readonly text: string
  readonly limit: number
  readonly since?: number
  readonly until?: number
  readonly fields?: readonly SearchFieldFilter[]
}

export interface SearchFieldFilter {
  readonly name: string
  readonly type: FieldType
  readonly value: string | number | boolean
}

export interface SearchRemoteResource<TPayload = unknown> {
  readonly ref: string
  readonly profile: ResourceProfileIdentity
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload?: TPayload
}

export interface SearchRemoteWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface SearchRemoteResult {
  readonly resources: readonly SearchRemoteResource[]
  readonly warnings: readonly SearchRemoteWarning[]
}

export interface SearchContext extends ProviderContext {
  readonly query: SearchRemoteQuery
  readonly signal: AbortSignal
}

export interface RetrieveContext extends ProviderContext {
  readonly ref: string
  readonly signal: AbortSignal
  readonly emitResource: (resource: RetrievedResource) => void | Promise<void>
  readonly emitArtifact: (artifact: ArtifactDescriptor) => void | Promise<void>
}

export interface DownloadContext extends ProviderContext {
  readonly artifact: ResolvedArtifactDescriptor
  readonly signal: AbortSignal
  readonly write: (chunk: Uint8Array) => void | Promise<void>
}

export interface ActionResource {
  readonly ref: string
  readonly sourceId: string
  readonly profile: ResourceProfileIdentity
  readonly completeness: 'partial' | 'complete'
  readonly deletedAt: number | null
  readonly payload: unknown | null
}

export interface ActionContext<TInput = unknown> extends ProviderContext {
  readonly input: TInput
  readonly signal: AbortSignal
  readonly resolveResource: (ref: string) => ActionResource | null
}
