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
  const grants = (await authService.listGrants(provider ?? undefined)).filter(
    (grant) => !account || grant.id === account || grant.accountId === account,
  )
  const matches = grants.filter((grant) => isGrantCompatible(auth, grant))
  if (matches.length === 0)
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no compatible Grant matches account "${account}"`
        : `no compatible Grant available; run ctxindex auth add ${provider ?? '<provider>'}`,
    )
  if (matches.length > 1)
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple compatible Grants available; choose one with --account <account-id|grant-id>: ${matches.map((grant) => grant.id).join(', ')}`,
    )
  return matches[0]?.id
}
