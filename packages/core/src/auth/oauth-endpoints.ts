import type { OAuthProviderSpec } from '@ctxindex/extension-sdk'
import { CtxindexAuthError } from '../errors'
import { isLoopbackHost } from '../net'

export type OAuthEndpointKind = 'authorize' | 'token' | 'identity'

export function assertOAuthProviderHost(
  provider: OAuthProviderSpec,
  url: string,
): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (cause) {
    throw new CtxindexAuthError(
      'oauth_host_denied',
      'OAuth endpoint URL is invalid',
      { cause },
    )
  }
  if (
    !provider.allowedHosts.includes(parsed.hostname) &&
    !isLoopbackHost(parsed.hostname)
  ) {
    throw new CtxindexAuthError(
      'oauth_host_denied',
      'OAuth endpoint host is not allowed by the provider declaration',
    )
  }
}

export function resolveOAuthEndpoint(
  provider: OAuthProviderSpec,
  kind: OAuthEndpointKind,
  readEnvironment: (name: string) => string | undefined,
): string {
  const declared =
    kind === 'authorize'
      ? provider.authorizationUrl
      : kind === 'token'
        ? provider.tokenUrl
        : provider.identity.url
  const mockBase = readEnvironment('CTXINDEX_OAUTH_MOCK_BASE_URL')
  if (process.env.NODE_ENV === 'production' || !mockBase) return declared
  let base: URL
  try {
    base = new URL(mockBase)
  } catch (cause) {
    throw new CtxindexAuthError(
      'oauth_host_denied',
      'OAuth mock base URL is invalid',
      { cause },
    )
  }
  if (
    base.protocol !== 'http:' ||
    !isLoopbackHost(base.hostname) ||
    base.username ||
    base.password ||
    base.hash
  ) {
    throw new CtxindexAuthError(
      'oauth_host_denied',
      'OAuth mock base URL must be loopback HTTP',
    )
  }
  return new URL(
    `/oauth/${encodeURIComponent(provider.id)}/${kind}`,
    base,
  ).toString()
}
