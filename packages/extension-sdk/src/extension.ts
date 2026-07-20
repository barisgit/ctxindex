import type { AnyAdapterDefinition } from './adapter'
import type { AnyOAuthAppDefinition } from './oauth-app'
import type { AnyProfileDefinition } from './profile'
import type { AnyProviderDefinition } from './provider'

export interface ExtensionDefinition<
  TId extends string = string,
  TProviders extends
    readonly AnyProviderDefinition[] = readonly AnyProviderDefinition[],
  TOAuthApps extends
    readonly AnyOAuthAppDefinition[] = readonly AnyOAuthAppDefinition[],
  TProfiles extends
    readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
  TAdapters extends
    readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
> {
  readonly kind: 'extension'
  readonly id: TId
  readonly providers: TProviders
  readonly oauthApps: TOAuthApps
  readonly profiles: TProfiles
  readonly adapters: TAdapters
}

export type AnyExtensionDefinition = ExtensionDefinition

export function defineExtension<
  const TId extends string,
  const TProviders extends readonly AnyProviderDefinition[] = readonly [],
  const TOAuthApps extends readonly AnyOAuthAppDefinition[] = readonly [],
  const TProfiles extends readonly AnyProfileDefinition[] = readonly [],
  const TAdapters extends readonly AnyAdapterDefinition[] = readonly [],
>(definition: {
  readonly id: TId
  readonly providers?: TProviders
  readonly oauthApps?: TOAuthApps
  readonly profiles?: TProfiles
  readonly adapters?: TAdapters
}): ExtensionDefinition<TId, TProviders, TOAuthApps, TProfiles, TAdapters> {
  return {
    ...definition,
    kind: 'extension',
    providers: definition.providers ?? ([] as unknown as TProviders),
    oauthApps: definition.oauthApps ?? ([] as unknown as TOAuthApps),
    profiles: definition.profiles ?? ([] as unknown as TProfiles),
    adapters: definition.adapters ?? ([] as unknown as TAdapters),
  }
}
