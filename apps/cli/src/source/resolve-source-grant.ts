import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'
import type { AuthService } from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'

export async function resolveSourceGrant(
  authService: AuthService,
  adapterId: string,
  account?: string,
): Promise<string | undefined> {
  const adapter = CTXINDEX_ADAPTER_REGISTRY.getAdapter(
    adapterId as 'google.mailbox' | 'local.directory',
  )
  if (adapter.auth.kind === 'none') return undefined

  const grants = await authService.listGoogleGrants()
  const matches = account
    ? grants.filter(
        (grant) => grant.id === account || grant.accountEmail === account,
      )
    : grants
  if (matches.length === 0) {
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no Google grant matches account "${account}"; run ctxindex auth list`
        : 'google authorization required; run ctxindex auth add google',
    )
  }
  if (matches.length > 1) {
    const choices = matches
      .map((grant) => grant.accountEmail ?? grant.id)
      .join(', ')
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple Google grants available; choose one with --account <email|grant-id>: ${choices}`,
    )
  }
  return matches[0]?.id
}
