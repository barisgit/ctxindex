import {
  type AuthService,
  isGrantCompatible,
  providerIdForAuth,
} from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import type { AnyAdapterDefinition } from '@ctxindex/extension-sdk'

export async function resolveSourceGrant(
  authService: AuthService,
  adapter: AnyAdapterDefinition,
  account?: string,
): Promise<string | undefined> {
  const provider = adapter.provider
  if (provider === undefined || provider.auth.kind === 'none') {
    if (account !== undefined)
      throw new CtxindexValidationError(
        'invalid_filter',
        `Adapter "${adapter.id}" does not accept an Account`,
      )
    return undefined
  }
  const auth = provider.auth
  if (auth.kind !== 'oauth2')
    throw new CtxindexValidationError(
      'invalid_filter',
      'Adapter authentication is not supported by this command',
    )
  const authorization = {
    provider,
    access: adapter.access ?? { scopes: [] },
  }
  const providerId = providerIdForAuth(authorization)
  const providerGrants = await authService.listGrants(providerId)
  let grants = providerGrants
  if (account) {
    const byLabel = providerGrants.filter(
      (grant) => grant.accountLabel === account,
    )
    const byAccountId = providerGrants.filter(
      (grant) => grant.accountId === account,
    )
    grants =
      byLabel.length > 0 ? byLabel : byAccountId.length > 0 ? byAccountId : []
  }
  const matches = grants.filter((grant) =>
    isGrantCompatible(authorization, grant),
  )
  if (matches.length === 0)
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no compatible Account authorization matches "${account}"`
        : `no compatible Account authorization available; run bun cli account add ${providerId ?? '<provider>'} --app <label>`,
    )
  if (matches.length > 1)
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple compatible Accounts available; choose one with --account <label|account-id>: ${matches.map((grant) => grant.accountLabel ?? grant.accountId).join(', ')}`,
    )
  return matches[0]?.id
}
