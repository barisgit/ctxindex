import {
  type AuthService,
  isGrantCompatible,
  providerKeyForAuth,
} from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'

type AdapterAuth = Parameters<typeof isGrantCompatible>[0]

export async function resolveSourceGrant(
  authService: AuthService,
  auth: AdapterAuth,
  account?: string,
): Promise<string | undefined> {
  if (auth.kind === 'none') return undefined
  if (auth.kind !== 'oauth2') {
    throw new CtxindexValidationError(
      'invalid_filter',
      'Adapter authentication is not supported by this command',
    )
  }
  const provider = providerKeyForAuth(auth)
  if (provider !== 'google') {
    throw new CtxindexValidationError(
      'invalid_filter',
      `authorization for provider "${provider ?? 'unknown'}" is unavailable`,
    )
  }

  const grants = await authService.listGoogleGrants()
  const selected = account
    ? grants.filter(
        (grant) => grant.id === account || grant.accountEmail === account,
      )
    : grants
  const matches = selected.filter((grant) => isGrantCompatible(auth, grant))
  if (matches.length === 0) {
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no compatible Google grant matches account "${account}"; run ctxindex auth list`
        : 'no compatible Google grant available; run ctxindex auth add google',
    )
  }
  if (matches.length > 1) {
    const choices = matches
      .map((grant) => grant.accountEmail ?? grant.id)
      .join(', ')
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple compatible Google grants available; choose one with --account <email|grant-id>: ${choices}`,
    )
  }
  return matches[0]?.id
}
