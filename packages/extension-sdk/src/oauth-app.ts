import type { z } from 'zod'
import type { AnyOAuth2Auth, ProviderDefinition } from './provider'

export type OAuthProviderDefinition<
  TAuth extends AnyOAuth2Auth = AnyOAuth2Auth,
> = ProviderDefinition<string, TAuth>

export interface OAuthAppDefinition<
  TProvider extends OAuthProviderDefinition = OAuthProviderDefinition,
  TLabel extends string = string,
  TConfig = unknown,
> {
  readonly kind: 'oauth-app'
  readonly provider: TProvider
  readonly label: TLabel
  readonly config: TConfig
}

export type AnyOAuthAppDefinition = OAuthAppDefinition

export function defineOAuthApp<
  const TProvider extends OAuthProviderDefinition,
  const TLabel extends string,
  const TConfig extends z.input<
    TProvider['auth']['registration']['configSchema']
  >,
>(
  provider: TProvider,
  definition: { readonly label: TLabel; readonly config: TConfig },
): OAuthAppDefinition<TProvider, TLabel, TConfig>
export function defineOAuthApp(
  provider: OAuthProviderDefinition,
  definition: { readonly label: string; readonly config: unknown },
): OAuthAppDefinition {
  return {
    kind: 'oauth-app',
    provider,
    label: definition.label,
    config: definition.config,
  }
}
