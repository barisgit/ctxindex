import { readEnvironmentVariable } from '../config'
import { CtxindexAuthError } from '../errors'
import type { ResolvedOAuthApp } from '../oauth-app'
import type { CompleteRegistry } from '../registry'
import type { OAuthAuthorizationResponsePrompt } from './loopback'
import { openOAuthLoopback } from './loopback'
import {
  assertOAuthProviderHost,
  fetchOAuthIdentity,
  postOAuthToken,
  resolveInitialGrantedScopes,
  resolveOAuthAppCredentials,
  resolveOAuthEndpoint,
} from './oauth'
import { resolveOAuthSelection } from './selection'
import type { AddGrantResult, AuthService } from './types'

export interface AuthorizeProviderInput {
  readonly provider: string
  readonly app: string
  readonly mode: 'loopback' | 'from-env'
  readonly label?: string
}
export interface AuthorizeProviderDependencies {
  readonly registry: CompleteRegistry
  readonly authService: AuthService
  readonly resolveApp: (
    providerId: string,
    label: string,
  ) => Promise<ResolvedOAuthApp>
  readonly readEnvironment?: (name: string) => string | undefined
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
  readonly readAuthorizationResponse?: (
    prompt: OAuthAuthorizationResponsePrompt,
  ) => Promise<string | undefined>
  readonly now?: () => number
}
export interface AuthorizeProviderResult extends AddGrantResult {
  readonly provider: string
  readonly scopes: readonly string[]
}

export async function authorizeProvider(
  input: AuthorizeProviderInput,
  deps: AuthorizeProviderDependencies,
): Promise<AuthorizeProviderResult> {
  const app = await deps.resolveApp(input.provider, input.app)
  const selection = resolveOAuthSelection(deps.registry, input.provider)
  const provider = selection.provider
  const readEnvironment = deps.readEnvironment ?? readEnvironmentVariable
  const { clientId, clientSecret } = resolveOAuthAppCredentials(app.config)
  let token: import('./oauth').OAuthTokenResponse
  let durableRefreshToken: string
  if (input.mode === 'from-env') {
    const refreshToken = readEnvironment('CTXINDEX_OAUTH_REFRESH_TOKEN')
    if (!refreshToken)
      throw new CtxindexAuthError(
        'invalid_grant',
        'OAuth refresh token environment value is unavailable',
      )
    token = await postOAuthToken({
      provider,
      endpoint: resolveOAuthEndpoint(provider, 'token', readEnvironment),
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      grant: { kind: 'refresh_token', refreshToken },
    })
    durableRefreshToken = token.refreshToken ?? refreshToken
  } else {
    const authorizationEndpoint = resolveOAuthEndpoint(
      provider,
      'authorize',
      readEnvironment,
    )
    assertOAuthProviderHost(provider, authorizationEndpoint)
    const timeoutSeconds = Number(
      readEnvironment('CTXINDEX_LOOPBACK_TIMEOUT_SECS'),
    )
    const callback = await openOAuthLoopback({
      provider,
      authorizationEndpoint,
      clientId,
      scopes: selection.requestedScopes,
      ...(Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0
        ? { timeoutMs: timeoutSeconds * 1000 }
        : {}),
      noBrowser: readEnvironment('CTXINDEX_NO_BROWSER') === '1',
      ...(deps.launchBrowser ? { launchBrowser: deps.launchBrowser } : {}),
      ...(deps.emitAuthorizationUrl
        ? { emitAuthorizationUrl: deps.emitAuthorizationUrl }
        : {}),
      ...(deps.readAuthorizationResponse
        ? { readAuthorizationResponse: deps.readAuthorizationResponse }
        : {}),
    })
    token = await postOAuthToken({
      provider,
      endpoint: resolveOAuthEndpoint(provider, 'token', readEnvironment),
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      grant: {
        kind: 'authorization_code',
        code: callback.code,
        redirectUri: callback.redirectUri,
        codeVerifier: callback.codeVerifier,
      },
    })
    if (!token.refreshToken)
      throw new CtxindexAuthError(
        'invalid_grant',
        'OAuth authorization did not return a durable refresh token',
      )
    durableRefreshToken = token.refreshToken
  }
  const scopes = resolveInitialGrantedScopes(token.scope, selection)
  const identity = await fetchOAuthIdentity({
    provider,
    endpoint: resolveOAuthEndpoint(provider, 'identity', readEnvironment),
    accessToken: token.accessToken,
  })
  const expiresAt = (deps.now ?? Date.now)() + token.expiresIn * 1000
  const result = await deps.authService.addGrant({
    provider: provider.id,
    account: {
      ...identity,
      ...(input.label !== undefined ? { label: input.label } : {}),
    },
    scopes,
    appConfig: app.config,
    accessToken: token.accessToken,
    refreshToken: durableRefreshToken,
    expiresAt,
  })
  return { ...result, provider: provider.id, scopes }
}
