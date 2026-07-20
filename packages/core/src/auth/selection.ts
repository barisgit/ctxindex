import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import { CtxindexValidationError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { CompleteRegistry } from '../registry'

function invalidSelection(message: string): CtxindexValidationError {
  return new CtxindexValidationError('invalid_oauth_selection', message)
}

export interface OAuthSelection {
  readonly provider: OAuthProviderDefinition
  readonly operationScopes: readonly string[]
  readonly requestedScopes: readonly string[]
}

export function resolveOAuthSelection(
  registry: CompleteRegistry,
  providerId: string,
): OAuthSelection {
  const provider = registry.providers.get(providerId)
  if (!provider || provider.auth.kind !== 'oauth2') {
    throw invalidSelection(`Unknown OAuth provider "${providerId}"`)
  }

  const operationScopes = [
    ...new Set(
      [...registry.adapters.values()].flatMap((adapter) =>
        adapter.provider?.id === providerId
          ? (adapter.access?.scopes ?? [])
          : [],
      ),
    ),
  ].sort(compareUnicodeCodePoints)
  const requestedScopes = [
    ...new Set([...provider.auth.baseScopes, ...operationScopes]),
  ].sort(compareUnicodeCodePoints)
  return {
    provider: provider as OAuthProviderDefinition,
    operationScopes,
    requestedScopes,
  }
}

export function selectedOAuthScopes(
  registry: CompleteRegistry,
  providerId: string,
): readonly string[] {
  return resolveOAuthSelection(registry, providerId).requestedScopes
}
