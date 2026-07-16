import type { OAuthProviderSpec } from '@ctxindex/extension-sdk'
import { CtxindexAuthError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { OAuthSelection } from './selection'

export function normalizeOAuthScopes(
  value: string | readonly string[],
): readonly string[] {
  const scopes = typeof value === 'string' ? value.trim().split(/\s+/) : value
  return [...new Set(scopes.filter((scope) => scope.length > 0))].sort(
    compareUnicodeCodePoints,
  )
}

function requireScopes(
  actual: readonly string[],
  required: readonly string[],
): void {
  const granted = new Set(actual)
  if (required.some((scope) => !granted.has(scope))) {
    throw new CtxindexAuthError(
      'insufficient_scope',
      'OAuth response omitted a required operation scope',
    )
  }
}

export function resolveInitialGrantedScopes(
  scope: string | undefined,
  selection: OAuthSelection,
): readonly string[] {
  if (scope === undefined) return selection.requestedScopes
  const normalized = normalizeOAuthScopes(scope)
  requireScopes(normalized, selection.operationScopes)
  return normalized
}

export function resolveRefreshGrantedScopes(
  scope: string | undefined,
  prior: readonly string[],
  provider: OAuthProviderSpec,
): readonly string[] {
  if (scope === undefined) return normalizeOAuthScopes(prior)
  const normalized = normalizeOAuthScopes(scope)
  const base = new Set(provider.baseScopes)
  requireScopes(
    normalized,
    prior.filter((item) => !base.has(item)),
  )
  return normalized
}
