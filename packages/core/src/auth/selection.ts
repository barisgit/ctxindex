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
  adapterIds: readonly string[],
): OAuthSelection {
  if (adapterIds.length === 0) {
    throw invalidSelection('OAuth Adapter selection must not be empty')
  }
  if (new Set(adapterIds).size !== adapterIds.length) {
    throw invalidSelection('OAuth Adapter selection contains duplicate ids')
  }
  const provider = registry.getOAuthProvider(providerId)
  if (!provider) {
    throw invalidSelection(`Unknown OAuth provider "${providerId}"`)
  }

  const selected = adapterIds.map((adapterId) => {
    const matches = registry
      .list()
      .filter((adapter) => adapter.id === adapterId)
    if (matches.length === 0) {
      throw invalidSelection(`Unknown Adapter "${adapterId}"`)
    }
    if (matches.length > 1) {
      throw invalidSelection(`Adapter "${adapterId}" has ambiguous versions`)
    }
    const adapter = matches[0]
    if (!adapter) throw invalidSelection(`Unknown Adapter "${adapterId}"`)
    if (adapter.auth.kind !== 'oauth2') {
      throw invalidSelection(`Adapter "${adapterId}" does not use OAuth`)
    }
    if (adapter.auth.provider.id !== providerId) {
      throw invalidSelection(
        `Adapter "${adapterId}" declares provider "${adapter.auth.provider.id}", not "${providerId}"`,
      )
    }
    return adapter
  })

  const operationScopes = [
    ...new Set(
      selected.flatMap((adapter) =>
        adapter.auth.kind === 'oauth2' ? adapter.auth.scopes : [],
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
  adapterIds: readonly string[],
): readonly string[] {
  return resolveOAuthSelection(registry, providerId, adapterIds).requestedScopes
}
