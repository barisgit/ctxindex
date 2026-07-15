import type { z } from 'zod'

export type DefinitionVersion = number
export type ProfileReference<
  TId extends string = string,
  TVersion extends number = number,
> = {
  readonly id: TId
  readonly version: TVersion
}

export type ProfileExportRenderResult = string | Uint8Array

export type ProfileRelationTarget =
  | { readonly ref: string }
  | { readonly field: string; readonly value: string }

export type ProfileRelationTargets =
  | ProfileRelationTarget
  | readonly ProfileRelationTarget[]
  | null
  | undefined

export interface ArtifactDescriptor {
  readonly ref: string
  readonly filename?: string | undefined
  readonly mediaType?: string | undefined
  readonly byteSize?: number | undefined
}

export interface ResolvedArtifactDescriptor extends ArtifactDescriptor {
  readonly originRef: string
}

export type FieldType =
  | 'string'
  | 'string[]'
  | 'number'
  | 'number[]'
  | 'boolean'
  | 'datetime'

export interface ProfileField<TPayload = unknown> {
  readonly type: FieldType
  readonly extract: (payload: TPayload) => unknown
  readonly docs?: string
}

export interface ProfileAction<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly effect: 'reversible' | 'irreversible'
  readonly input: TInput
  readonly output: ProfileReference
  readonly docs: string
  readonly examples?: readonly unknown[]
}

export interface ProfileDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly id: TId
  readonly version: TVersion
  readonly schema: TSchema
  readonly search?: {
    readonly title?: (payload: z.infer<TSchema>) => string | null
    readonly occurredAt?: (payload: z.infer<TSchema>) => Date | null
    readonly chunks?: (payload: z.infer<TSchema>) => readonly string[]
    readonly fields?: Readonly<Record<string, ProfileField<z.infer<TSchema>>>>
  }
  readonly relations?: Readonly<
    Record<string, (payload: z.infer<TSchema>) => ProfileRelationTargets>
  >
  readonly artifacts?: (
    payload: z.infer<TSchema>,
  ) => readonly ArtifactDescriptor[]
  readonly exports?: Readonly<
    Record<
      string,
      {
        readonly mediaType: string
        readonly render: (
          payload: z.infer<TSchema>,
          dependencies?: unknown,
        ) => ProfileExportRenderResult
      }
    >
  >
  readonly actions?: Readonly<Record<string, ProfileAction>>
  readonly docs?: {
    readonly summary: string
    readonly aliases?: readonly string[]
    readonly examples?: readonly unknown[]
  }
}

export type AnyProfileDefinition = ProfileDefinition<
  string,
  number,
  z.ZodTypeAny
>
export type InferProfilePayload<TProfile extends AnyProfileDefinition> =
  z.infer<TProfile['schema']>

export type AdapterCapability =
  | 'sync'
  | 'search-remote'
  | 'retrieve'
  | 'download'
export type SearchRouting = 'indexed' | 'federated' | 'hybrid'

export type AdapterAuthSpec =
  | {
      readonly kind: 'oauth2'
      readonly provider: {
        readonly authUrl: string
        readonly tokenUrl: string
      }
      readonly scopes: readonly string[]
    }
  | { readonly kind: 'api-key'; readonly label: string }
  | { readonly kind: 'basic' | 'none' | 'custom' }

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

export interface SyncContext extends ProviderContext {
  readonly cursor: unknown | null
  readonly signal: AbortSignal
  readonly emit: (operation: unknown) => void | Promise<void>
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
  readonly profile: ProfileReference
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload?: TPayload
}

export interface RetrievedResource<TPayload = unknown> {
  readonly ref: string
  readonly profile: ProfileReference
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload: TPayload
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

export interface ActionContext<TInput = unknown> extends ProviderContext {
  readonly input: TInput
  readonly signal: AbortSignal
}

export type AdapterOperations = {
  readonly sync?: (context: SyncContext) => unknown
  readonly searchRemote?: (
    context: SearchContext,
  ) => Promise<SearchRemoteResult>
  readonly retrieve?: (context: RetrieveContext) => void | Promise<void>
  readonly download?: (context: DownloadContext) => void | Promise<void>
}

type CapabilityOperation<
  TCapabilities extends readonly AdapterCapability[],
  TCapability extends AdapterCapability,
  TOperation extends keyof AdapterOperations,
> = TCapability extends TCapabilities[number]
  ? { readonly [K in TOperation]: NonNullable<AdapterOperations[K]> }
  : { readonly [K in TOperation]?: never }

export type AdapterOperationsFor<
  TCapabilities extends readonly AdapterCapability[],
> = CapabilityOperation<TCapabilities, 'sync', 'sync'> &
  CapabilityOperation<TCapabilities, 'search-remote', 'searchRemote'> &
  CapabilityOperation<TCapabilities, 'retrieve', 'retrieve'> &
  CapabilityOperation<TCapabilities, 'download', 'download'>

export interface AdapterActionBinding<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly profile: ProfileReference
  readonly input: TInput
  readonly output: ProfileReference
  readonly run: {
    bivarianceHack(
      context: ActionContext<z.infer<TInput>>,
    ): RetrievedResource | Promise<RetrievedResource>
  }['bivarianceHack']
}

export interface AdapterDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TCapabilities extends
    readonly AdapterCapability[] = readonly AdapterCapability[],
  TActions extends Readonly<Record<string, AdapterActionBinding>> = Readonly<
    Record<string, AdapterActionBinding>
  >,
> {
  readonly id: TId
  readonly version: TVersion
  readonly configSchema: TConfigSchema
  readonly auth: AdapterAuthSpec
  readonly profiles: readonly ProfileReference[]
  readonly routing: SearchRouting
  readonly capabilities: TCapabilities
  readonly operations: AdapterOperationsFor<TCapabilities>
  readonly actions: TActions
  readonly docs?: { readonly summary: string }
}

export type AnyAdapterDefinition = Omit<
  AdapterDefinition<
    string,
    number,
    z.ZodTypeAny,
    readonly [],
    Readonly<Record<string, AdapterActionBinding>>
  >,
  'capabilities' | 'operations'
> & {
  readonly capabilities: readonly AdapterCapability[]
  readonly operations: AdapterOperations
}

export interface ExtensionDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TProfiles extends
    readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
  TAdapters extends
    readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
> {
  readonly id: TId
  readonly version: TVersion
  readonly profiles: TProfiles
  readonly adapters: TAdapters
  readonly docs?: { readonly summary: string }
}

export type AnyExtensionDefinition = ExtensionDefinition

export interface ExtensionAuthoringHost {
  readonly z: typeof import('zod').z
  readonly defineProfile: typeof defineProfile
  readonly defineAdapter: typeof defineAdapter
  readonly defineExtension: typeof defineExtension
}

export function defineProfile<
  const TId extends string,
  const TVersion extends number,
  TSchema extends z.ZodTypeAny,
>(
  definition: ProfileDefinition<TId, TVersion, TSchema>,
): ProfileDefinition<TId, TVersion, TSchema> {
  return definition
}

export function defineAdapter<
  const TId extends string,
  const TVersion extends number,
  TConfigSchema extends z.ZodTypeAny,
  const TCapabilities extends readonly AdapterCapability[],
  const TActions extends Readonly<Record<string, AdapterActionBinding>>,
>(
  definition: AdapterDefinition<
    TId,
    TVersion,
    TConfigSchema,
    TCapabilities,
    TActions
  >,
): AdapterDefinition<TId, TVersion, TConfigSchema, TCapabilities, TActions> {
  return definition
}

export function defineExtension<
  const TId extends string,
  const TVersion extends number,
  const TProfiles extends readonly AnyProfileDefinition[],
  const TAdapters extends readonly AnyAdapterDefinition[],
>(
  definition: ExtensionDefinition<TId, TVersion, TProfiles, TAdapters>,
): ExtensionDefinition<TId, TVersion, TProfiles, TAdapters> {
  return definition
}
