import { readEnvironmentVariable } from '../config'
import { CtxindexAuthError } from '../errors'
import type { AdapterRegistry } from '../registry'
import { openOAuthLoopback } from './loopback'
import {
  assertOAuthProviderHost,
  fetchOAuthIdentity,
  postOAuthToken,
  resolveInitialGrantedScopes,
  resolveOAuthEndpoint,
} from './oauth'
import { resolveOAuthSelection } from './selection'
import type { AddGrantResult, AuthService } from './types'

export interface AuthorizeProviderInput {
  readonly provider: string
  readonly adapterIds: readonly string[]
  readonly mode: 'loopback' | 'from-env'
  readonly clientId?: string
  readonly label?: string
}
export interface AuthorizeProviderDependencies {
  readonly registry: AdapterRegistry
  readonly authService: AuthService
  readonly readEnvironment?: (name: string) => string | undefined
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
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
  const selection = resolveOAuthSelection(
    deps.registry,
    input.provider,
    input.adapterIds,
  )
  const provider = selection.provider
  const readEnvironment = deps.readEnvironment ?? readEnvironmentVariable
  const clientId =
    input.clientId ?? readEnvironment(provider.environment.clientId)
  if (!clientId)
    throw new CtxindexAuthError(
      'missing_oauth_client_creds',
      'OAuth client id is unavailable',
    )
  const clientSecretName = provider.environment.clientSecret
  const clientSecret = clientSecretName
    ? readEnvironment(clientSecretName)
    : undefined
  if (provider.client.secret === 'required' && !clientSecret)
    throw new CtxindexAuthError(
      'missing_oauth_client_creds',
      'OAuth client secret is unavailable',
    )
  let token: import('./oauth').OAuthTokenResponse
  let durableRefreshToken: string
  if (input.mode === 'from-env') {
    const refreshToken = readEnvironment(provider.environment.refreshToken)
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
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    accessToken: token.accessToken,
    refreshToken: durableRefreshToken,
    expiresAt,
  })
  return { ...result, provider: provider.id, scopes }
}
