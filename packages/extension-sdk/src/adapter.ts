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
import type { ProfileReference } from './reference'

export type AdapterCapability =
  | 'sync'
  | 'search-remote'
  | 'retrieve'
  | 'download'

export type SearchRouting = 'indexed' | 'federated' | 'hybrid'

type JsonPath = readonly [string, ...string[]]

interface OAuthProviderBase {
  readonly id: string
  readonly authorizationUrl: string
  readonly tokenUrl: string
  readonly identity: {
    readonly url: string
    readonly subjectPath: JsonPath
    readonly labelPaths: readonly [JsonPath, ...JsonPath[]]
    readonly identities: readonly [
      {
        readonly kind: string
        readonly path: JsonPath
        readonly verifiedPath?: JsonPath
      },
      ...{
        readonly kind: string
        readonly path: JsonPath
        readonly verifiedPath?: JsonPath
      }[],
    ]
  }
  readonly pkce: { readonly method: 'S256'; readonly required: true }
  readonly baseScopes: readonly string[]
  readonly allowedHosts: readonly string[]
  readonly fixedAuthorizationParams?: Readonly<Record<string, string>>
}

export type OAuthProviderSpec = OAuthProviderBase &
  (
    | {
        readonly client: {
          readonly type: 'public'
          readonly secret: 'none'
          readonly tokenAuthMethod: 'none'
        }
        readonly environment: {
          readonly clientId: string
          readonly clientSecret?: never
          readonly refreshToken: string
        }
      }
    | {
        readonly client: {
          readonly type: 'public'
          readonly secret: 'optional'
          readonly tokenAuthMethod: 'client_secret_post'
        }
        readonly environment: {
          readonly clientId: string
          readonly clientSecret?: string
          readonly refreshToken: string
        }
      }
    | {
        readonly client: {
          readonly type: 'confidential'
          readonly secret: 'required'
          readonly tokenAuthMethod: 'client_secret_post'
        }
        readonly environment: {
          readonly clientId: string
          readonly clientSecret: string
          readonly refreshToken: string
        }
      }
  )

export type AdapterAuthSpec =
  | {
      readonly kind: 'oauth2'
      readonly provider: OAuthProviderSpec
      readonly scopes: readonly string[]
    }
  | { readonly kind: 'api-key'; readonly label: string }
  | { readonly kind: 'basic' | 'none' | 'custom' }

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
  TAuth extends AdapterAuthSpec = AdapterAuthSpec,
> {
  readonly id: TId
  readonly version: TVersion
  readonly configSchema: TConfigSchema
  readonly auth: TAuth
  /** Provider API hosts this Adapter may contact. Missing/empty denies network egress. */
  readonly providerApiHosts?: readonly string[]
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

export function defineAdapter<
  const TId extends string,
  const TVersion extends number,
  TConfigSchema extends z.ZodTypeAny,
  const TCapabilities extends readonly AdapterCapability[],
  const TActions extends Readonly<Record<string, AdapterActionBinding>>,
  const TAuth extends AdapterAuthSpec,
>(
  definition: AdapterDefinition<
    TId,
    TVersion,
    TConfigSchema,
    TCapabilities,
    TActions,
    TAuth
  >,
): AdapterDefinition<
  TId,
  TVersion,
  TConfigSchema,
  TCapabilities,
  TActions,
  TAuth
> {
  return definition
}
