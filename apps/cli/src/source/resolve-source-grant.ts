import {
  type AuthService,
  isGrantCompatible,
  providerIdForAuth,
} from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'

type AdapterAuth = Parameters<typeof isGrantCompatible>[0]
export async function resolveSourceGrant(
  authService: AuthService,
  auth: AdapterAuth,
  account?: string,
): Promise<string | undefined> {
  if (auth.kind === 'none') return undefined
  if (auth.kind !== 'oauth2')
    throw new CtxindexValidationError(
      'invalid_filter',
      'Adapter authentication is not supported by this command',
    )
  const provider = providerIdForAuth(auth)
  const providerGrants = await authService.listGrants(provider ?? undefined)
  let grants = providerGrants
  if (account) {
    const byLabel = providerGrants.filter(
      (grant) => grant.accountLabel === account,
    )
    const byAccountId = providerGrants.filter(
      (grant) => grant.accountId === account,
    )
    const byGrantId = providerGrants.filter((grant) => grant.id === account)
    grants =
      byLabel.length > 0
        ? byLabel
        : byAccountId.length > 0
          ? byAccountId
          : byGrantId
  }
  const matches = grants.filter((grant) => isGrantCompatible(auth, grant))
  if (matches.length === 0)
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no compatible Grant matches account "${account}"`
        : `no compatible Grant available; run bun cli account add ${provider ?? '<provider>'}`,
    )
  if (matches.length > 1)
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple compatible Grants available; choose one with --account <label|account-id|grant-id>: ${matches.map((grant) => grant.accountLabel ?? grant.accountId).join(', ')}`,
    )
  return matches[0]?.id
}
