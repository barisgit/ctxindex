import type { z } from 'zod'

export type DefinitionVersion = number
export type ProfileReference<
  TId extends string = string,
  TVersion extends number = number,
> = {
  readonly id: TId
  readonly version: TVersion
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
    Record<string, (payload: z.infer<TSchema>) => unknown>
  >
  readonly artifacts?: (payload: z.infer<TSchema>) => readonly unknown[]
  readonly exports?: Readonly<
    Record<
      string,
      {
        readonly mediaType: string
        readonly render: (
          payload: z.infer<TSchema>,
          dependencies?: unknown,
        ) => unknown
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

type AdapterOperation = (...args: readonly unknown[]) => unknown

export type AdapterOperations = {
  readonly sync?: AdapterOperation
  readonly searchRemote?: AdapterOperation
  readonly retrieve?: AdapterOperation
  readonly download?: AdapterOperation
}

type CapabilityOperation<
  TCapabilities extends readonly AdapterCapability[],
  TCapability extends AdapterCapability,
  TOperation extends keyof AdapterOperations,
> = TCapability extends TCapabilities[number]
  ? { readonly [K in TOperation]: AdapterOperation }
  : { readonly [K in TOperation]?: never }

export type AdapterOperationsFor<
  TCapabilities extends readonly AdapterCapability[],
> = CapabilityOperation<TCapabilities, 'sync', 'sync'> &
  CapabilityOperation<TCapabilities, 'search-remote', 'searchRemote'> &
  CapabilityOperation<TCapabilities, 'retrieve', 'retrieve'> &
  CapabilityOperation<TCapabilities, 'download', 'download'>

export interface AdapterActionBinding {
  readonly profile: ProfileReference
  readonly input: z.ZodTypeAny
  readonly output: ProfileReference
  readonly run: (...args: readonly unknown[]) => unknown
}

export interface AdapterDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TCapabilities extends
    readonly AdapterCapability[] = readonly AdapterCapability[],
> {
  readonly id: TId
  readonly version: TVersion
  readonly configSchema: TConfigSchema
  readonly auth: AdapterAuthSpec
  readonly profiles: readonly ProfileReference[]
  readonly capabilities: TCapabilities
  readonly operations: AdapterOperationsFor<TCapabilities>
  readonly actions: Readonly<Record<string, AdapterActionBinding>>
  readonly docs?: { readonly summary: string }
}

export type AnyAdapterDefinition = Omit<
  AdapterDefinition<string, number, z.ZodTypeAny, readonly []>,
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
>(
  definition: AdapterDefinition<
    TId,
    TVersion,
    TConfigSchema,
    TCapabilities
  >,
): AdapterDefinition<TId, TVersion, TConfigSchema, TCapabilities> {
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
