import type { AnyAdapterDefinition } from './adapter'
import type { DocumentationDeclaration } from './documentation'
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
  TDocs extends DocumentationDeclaration | undefined =
    | DocumentationDeclaration
    | undefined,
> {
  readonly kind: 'extension'
  readonly id: TId
  readonly providers: TProviders
  readonly oauthApps: TOAuthApps
  readonly profiles: TProfiles
  readonly adapters: TAdapters
  readonly docs?: TDocs
}

export type AnyExtensionDefinition = ExtensionDefinition

export function defineExtension<
  const TId extends string,
  const TProviders extends readonly AnyProviderDefinition[] = readonly [],
  const TOAuthApps extends readonly AnyOAuthAppDefinition[] = readonly [],
  const TProfiles extends readonly AnyProfileDefinition[] = readonly [],
  const TAdapters extends readonly AnyAdapterDefinition[] = readonly [],
  const TDocs extends DocumentationDeclaration | undefined = undefined,
>(definition: {
  readonly id: TId
  readonly providers?: TProviders
  readonly oauthApps?: TOAuthApps
  readonly profiles?: TProfiles
  readonly adapters?: TAdapters
  readonly docs?: TDocs
}): ExtensionDefinition<
  TId,
  TProviders,
  TOAuthApps,
  TProfiles,
  TAdapters,
  TDocs
> {
  return {
    ...definition,
    kind: 'extension',
    providers: definition.providers ?? ([] as unknown as TProviders),
    oauthApps: definition.oauthApps ?? ([] as unknown as TOAuthApps),
    profiles: definition.profiles ?? ([] as unknown as TProfiles),
    adapters: definition.adapters ?? ([] as unknown as TAdapters),
  }
}
