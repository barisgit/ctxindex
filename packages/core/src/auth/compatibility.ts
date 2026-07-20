import { normalizeGrantScopes } from '../account'

export type ProviderAuthorizationBinding =
  | {
      readonly provider?: { readonly id: string }
      readonly access?: { readonly scopes: readonly string[] }
    }
  | {
      readonly kind: string
      readonly provider?: { readonly id: string }
      readonly scopes?: readonly string[]
    }

export interface GrantCompatibilityInput {
  readonly provider: string
  readonly scopes: unknown
}

export function providerIdForAuth(
  binding: ProviderAuthorizationBinding,
): string | undefined {
  if ('kind' in binding && binding.kind !== 'oauth2') return undefined
  return binding.provider?.id
}

export { normalizeGrantScopes } from '../account'

export function isGrantCompatible(
  binding: ProviderAuthorizationBinding,
  grant: GrantCompatibilityInput,
): boolean {
  const provider = providerIdForAuth(binding)
  if (provider === undefined || provider !== grant.provider) return false
  const scopes = new Set(normalizeGrantScopes(grant.scopes))
  const required =
    'kind' in binding ? (binding.scopes ?? []) : (binding.access?.scopes ?? [])
  return required.every((scope) => scopes.has(scope))
}
