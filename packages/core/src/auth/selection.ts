import { CtxindexValidationError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { AdapterRegistry } from '../registry'

function invalidSelection(message: string): CtxindexValidationError {
  return new CtxindexValidationError('invalid_oauth_selection', message)
}

export interface OAuthSelection {
  readonly provider: NonNullable<
    ReturnType<AdapterRegistry['getOAuthProvider']>
  >
  readonly operationScopes: readonly string[]
  readonly requestedScopes: readonly string[]
}

export function resolveOAuthSelection(
  registry: AdapterRegistry,
  providerId: string,
): OAuthSelection {
  const provider = registry.getOAuthProvider(providerId)
  if (!provider) {
    throw invalidSelection(`Unknown OAuth provider "${providerId}"`)
  }

  const operationScopes = [
    ...new Set(
      registry
        .list()
        .flatMap((adapter) =>
          adapter.auth.kind === 'oauth2' &&
          adapter.auth.provider.id === providerId
            ? adapter.auth.scopes
            : [],
        ),
    ),
  ].sort(compareUnicodeCodePoints)
  const requestedScopes = [
    ...new Set([...provider.baseScopes, ...operationScopes]),
  ].sort(compareUnicodeCodePoints)
  return { provider, operationScopes, requestedScopes }
}

export function selectedOAuthScopes(
  registry: AdapterRegistry,
  providerId: string,
): readonly string[] {
  return resolveOAuthSelection(registry, providerId).requestedScopes
}
