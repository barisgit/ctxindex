import type { AdapterAuthSpec } from '@ctxindex/extension-sdk'

export interface GrantCompatibilityInput {
  readonly provider: string
  readonly scopes: unknown
}

const PROVIDER_BY_TOKEN_HOST: Readonly<Record<string, string>> = {
  'oauth2.googleapis.com': 'google',
  'login.microsoftonline.com': 'microsoft',
}

export function providerKeyForAuth(auth: AdapterAuthSpec): string | undefined {
  if (auth.kind !== 'oauth2') return undefined
  const host = new URL(auth.provider.tokenUrl).hostname.toLowerCase()
  return PROVIDER_BY_TOKEN_HOST[host] ?? host.replace(/^www\./, '')
}

export function normalizeGrantScopes(scopes: unknown): readonly string[] {
  let values: readonly unknown[]
  if (Array.isArray(scopes)) {
    values = scopes
  } else if (typeof scopes === 'string') {
    const trimmed = scopes.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        values = Array.isArray(parsed) ? parsed : []
      } catch {
        values = []
      }
    } else {
      values = trimmed.split(/\s+/)
    }
  } else {
    values = []
  }

  return [
    ...new Set(
      values.filter(
        (scope): scope is string =>
          typeof scope === 'string' && scope.length > 0,
      ),
    ),
  ].sort()
}

export function isGrantCompatible(
  auth: AdapterAuthSpec,
  grant: GrantCompatibilityInput,
): boolean {
  if (auth.kind !== 'oauth2') return false
  const provider = providerKeyForAuth(auth)
  if (provider === undefined || provider !== grant.provider) return false
  const scopes = new Set(normalizeGrantScopes(grant.scopes))
  return auth.scopes.every((scope) => scopes.has(scope))
}
