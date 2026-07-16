import type { AdapterAuthSpec } from '@ctxindex/extension-sdk'
import { normalizeGrantScopes } from '../account'

export interface GrantCompatibilityInput {
  readonly provider: string
  readonly scopes: unknown
}

export function providerIdForAuth(auth: AdapterAuthSpec): string | undefined {
  return auth.kind === 'oauth2' ? auth.provider.id : undefined
}

export { normalizeGrantScopes } from '../account'

export function isGrantCompatible(
  auth: AdapterAuthSpec,
  grant: GrantCompatibilityInput,
): boolean {
  if (auth.kind !== 'oauth2') return false
  const provider = providerIdForAuth(auth)
  if (provider === undefined || provider !== grant.provider) return false
  const scopes = new Set(normalizeGrantScopes(grant.scopes))
  return auth.scopes.every((scope) => scopes.has(scope))
}
