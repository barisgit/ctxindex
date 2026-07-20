import type { z } from 'zod'

type JsonPath = readonly [string, ...string[]]

type UppercaseLetter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export type EnvironmentName<TName extends string = never> =
  TName extends `${UppercaseLetter | '_'}${infer Rest}`
    ? ValidateEnvironmentNameRest<Rest> extends true
      ? TName
      : never
    : never

type ValidateEnvironmentNameRest<TName extends string> = TName extends ''
  ? true
  : TName extends `${UppercaseLetter | Digit | '_'}${infer Rest}`
    ? ValidateEnvironmentNameRest<Rest>
    : false

type ValidateEnvironmentMapping<
  TEnvironment extends Readonly<Record<string, string>>,
> = {
  readonly [TKey in keyof TEnvironment]: EnvironmentName<TEnvironment[TKey]>
}

interface OAuthIdentityDefinition {
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

type OAuth2Environment<TConfigSchema extends z.ZodTypeAny> = Readonly<
  Record<
    z.input<TConfigSchema> extends Readonly<Record<string, unknown>>
      ? Extract<keyof z.input<TConfigSchema>, string>
      : never,
    string
  >
>

export type OAuth2RegistrationPolicy<
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TEnvironment extends OAuth2Environment<TConfigSchema> = never,
> = {
  readonly type: 'public' | 'confidential'
  readonly configSchema: TConfigSchema
  readonly environment: TEnvironment & ValidateEnvironmentMapping<TEnvironment>
}

interface OAuth2AuthInput<TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly authorizationUrl: string
  readonly tokenUrl: string
  readonly identity: OAuthIdentityDefinition
  readonly pkce: { readonly method: 'S256'; readonly required: true }
  readonly registration: {
    readonly type: 'public' | 'confidential'
    readonly configSchema: TConfigSchema
    readonly environment: OAuth2Environment<TConfigSchema>
  }
  readonly baseScopes: readonly string[]
  readonly allowedHosts: readonly string[]
  readonly fixedAuthorizationParams?: Readonly<Record<string, string>>
}

declare const oauth2AuthDefinition: unique symbol

type OAuth2AuthDefinition = {
  readonly kind: 'oauth2'
  readonly [oauth2AuthDefinition]: Readonly<Record<string, string>>
}

type OAuth2AuthDefinitionFor<
  TEnvironment extends Readonly<Record<string, string>>,
> = Omit<OAuth2AuthDefinition, typeof oauth2AuthDefinition> & {
  readonly [oauth2AuthDefinition]: TEnvironment
}

export type OAuth2Auth<
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TEnvironment extends OAuth2Environment<TConfigSchema> = never,
> = Omit<OAuth2AuthInput<TConfigSchema>, 'registration'> & {
  readonly registration: OAuth2RegistrationPolicy<TConfigSchema, TEnvironment>
} & OAuth2AuthDefinitionFor<TEnvironment>

export type AnyOAuth2Auth = Omit<OAuth2AuthInput, 'registration'> & {
  readonly registration: {
    readonly type: 'public' | 'confidential'
    readonly configSchema: z.ZodTypeAny
    readonly environment: Readonly<Record<string, string>>
  }
} & OAuth2AuthDefinition

type ExactOAuth2Auth<TAuth extends AnyOAuth2Auth> = TAuth & {
  readonly registration: TAuth['registration'] & {
    readonly environment: ValidateEnvironmentMapping<
      TAuth['registration']['environment']
    >
  }
} & OAuth2AuthDefinitionFor<TAuth['registration']['environment']>

export interface NoneAuth {
  readonly kind: 'none'
}

type AnyProviderAuth = AnyOAuth2Auth | NoneAuth

export type ProviderAuth<
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TEnvironment extends OAuth2Environment<TConfigSchema> = never,
> = OAuth2Auth<TConfigSchema, TEnvironment> | NoneAuth

export const auth = {
  oauth2<
    const TConfigSchema extends z.ZodTypeAny,
    const TDefinition extends OAuth2AuthInput<TConfigSchema>,
  >(
    definition: TDefinition & {
      readonly registration: TDefinition['registration'] & {
        readonly environment: ValidateEnvironmentMapping<
          TDefinition['registration']['environment']
        >
      }
    },
  ): TDefinition &
    OAuth2AuthDefinitionFor<TDefinition['registration']['environment']> {
    return { ...definition, kind: 'oauth2' } as unknown as TDefinition &
      OAuth2AuthDefinitionFor<TDefinition['registration']['environment']>
  },
  none(): NoneAuth {
    return { kind: 'none' }
  },
} as const

export interface ProviderDefinition<
  TId extends string = string,
  TAuth extends AnyProviderAuth = AnyProviderAuth,
> {
  readonly kind: 'provider'
  readonly id: TId
  readonly auth: TAuth
}

export type AnyProviderDefinition = ProviderDefinition<string, AnyProviderAuth>

export function defineProvider<const TId extends string>(
  definition: Omit<ProviderDefinition<TId, NoneAuth>, 'kind'>,
): ProviderDefinition<TId, NoneAuth>
export function defineProvider<
  const TId extends string,
  const TAuth extends AnyOAuth2Auth,
>(
  definition: Omit<ProviderDefinition<TId, TAuth>, 'kind'> & {
    readonly auth: TAuth extends ExactOAuth2Auth<TAuth> ? TAuth : never
  },
): ProviderDefinition<TId, TAuth>
export function defineProvider(
  definition: Omit<AnyProviderDefinition, 'kind'>,
): AnyProviderDefinition {
  return { ...definition, kind: 'provider' }
}
