import type { z } from 'zod'
import type {
  ActionContext,
  DownloadContext,
  RetrieveContext,
  RetrievedResource,
  SearchContext,
  SearchRemoteResult,
  SyncContext,
} from './operations'
import type { AnyProfileDefinition } from './profile'
import type { AnyOAuth2Auth, AnyProviderDefinition, NoneAuth } from './provider'

export type AdapterCapability =
  | 'sync'
  | 'search-remote'
  | 'retrieve'
  | 'download'

export type SearchRouting = 'indexed' | 'federated' | 'hybrid'

export type ProfileTarget = AnyProfileDefinition

export type AdapterOperations = {
  readonly sync?: (context: SyncContext) => void | Promise<void>
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
  readonly profile: ProfileTarget
  readonly input: TInput
  readonly output: ProfileTarget
  readonly run: {
    bivarianceHack(
      context: ActionContext<z.infer<TInput>>,
    ): RetrievedResource | Promise<RetrievedResource>
  }['bivarianceHack']
}

type AdapterProviderBinding<
  TProvider extends AnyProviderDefinition | undefined,
  TScopes extends readonly string[],
> = TProvider extends undefined
  ? {
      readonly provider?: never
      readonly access?: never
      readonly providerApiHosts?: never
    }
  : TProvider extends AnyProviderDefinition
    ? {
        readonly provider: TProvider
        /** Provider API hosts this Adapter may contact. Missing/empty denies network egress. */
        readonly providerApiHosts?: readonly string[]
      } & (TProvider['auth'] extends NoneAuth
        ? { readonly access?: never }
        : TProvider['auth'] extends AnyOAuth2Auth
          ? { readonly access: { readonly scopes: TScopes } }
          : { readonly access?: { readonly scopes: TScopes } })
    : never

interface AdapterDefinitionBase<
  TId extends string,
  TConfigSchema extends z.ZodTypeAny,
  TCapabilities extends readonly AdapterCapability[],
  TActions extends Readonly<Record<string, AdapterActionBinding>>,
  TProfiles extends readonly ProfileTarget[],
> {
  readonly kind: 'adapter'
  readonly id: TId
  readonly configSchema: TConfigSchema
  readonly profiles: TProfiles
  readonly routing: SearchRouting
  readonly capabilities: TCapabilities
  readonly operations: AdapterOperationsFor<TCapabilities>
  readonly actions: TActions
}

export type AdapterDefinition<
  TId extends string = string,
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TCapabilities extends
    readonly AdapterCapability[] = readonly AdapterCapability[],
  TActions extends Readonly<Record<string, AdapterActionBinding>> = Readonly<
    Record<string, AdapterActionBinding>
  >,
  TProfiles extends readonly ProfileTarget[] = readonly ProfileTarget[],
  TProvider extends AnyProviderDefinition | undefined =
    | AnyProviderDefinition
    | undefined,
  TScopes extends readonly string[] = readonly string[],
> = AdapterDefinitionBase<
  TId,
  TConfigSchema,
  TCapabilities,
  TActions,
  TProfiles
> &
  AdapterProviderBinding<TProvider, TScopes>

export type AnyAdapterDefinition = Omit<
  AdapterDefinitionBase<
    string,
    z.ZodTypeAny,
    readonly AdapterCapability[],
    Readonly<Record<string, AdapterActionBinding>>,
    readonly ProfileTarget[]
  >,
  'operations'
> & {
  readonly operations: AdapterOperations
  readonly provider?: AnyProviderDefinition
  readonly providerApiHosts?: readonly string[]
  readonly access?: { readonly scopes: readonly string[] }
}

export function defineAdapter<
  const TId extends string,
  TConfigSchema extends z.ZodTypeAny,
  const TCapabilities extends readonly AdapterCapability[],
  const TActions extends Readonly<Record<string, AdapterActionBinding>>,
  const TProfiles extends readonly ProfileTarget[],
>(
  definition: Omit<
    AdapterDefinitionBase<
      TId,
      TConfigSchema,
      TCapabilities,
      TActions,
      TProfiles
    >,
    'kind'
  > &
    AdapterProviderBinding<undefined, readonly []>,
): AdapterDefinition<
  TId,
  TConfigSchema,
  TCapabilities,
  TActions,
  TProfiles,
  undefined,
  readonly []
>
export function defineAdapter<
  const TId extends string,
  TConfigSchema extends z.ZodTypeAny,
  const TCapabilities extends readonly AdapterCapability[],
  const TActions extends Readonly<Record<string, AdapterActionBinding>>,
  const TProfiles extends readonly ProfileTarget[],
  const TProvider extends AnyProviderDefinition,
  const TScopes extends readonly string[] = readonly string[],
>(
  definition: Omit<
    AdapterDefinitionBase<
      TId,
      TConfigSchema,
      TCapabilities,
      TActions,
      TProfiles
    >,
    'kind'
  > &
    AdapterProviderBinding<TProvider, TScopes>,
): AdapterDefinition<
  TId,
  TConfigSchema,
  TCapabilities,
  TActions,
  TProfiles,
  TProvider,
  TScopes
>
export function defineAdapter(
  definition: Omit<AnyAdapterDefinition, 'kind'>,
): AnyAdapterDefinition {
  return { ...definition, kind: 'adapter' }
}
