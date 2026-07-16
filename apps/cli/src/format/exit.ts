import {
  CtxindexAuthError,
  CtxindexNotFoundError,
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import { CtxindexSecretsError } from '@ctxindex/core/secrets'
import { mapSyncErrorCode } from '@ctxindex/core/sync'

function authErrorExit(err: CtxindexAuthError): number {
  if (err.code === 'needs_auth' || err.code === 'invalid_grant') return 10
  if (err.code === 'invalid_client' || err.code === 'oauth_failed') return 10
  if (err.code === 'network_error') return 30
  // SPEC §12: any other failure maps to 50; exit code 1 is not stable.
  return 50
}

export function mapErrorToExit(err: unknown): number {
  const explicit = (err as { exitCode?: number }).exitCode
  if (typeof explicit === 'number') return explicit

  if (err instanceof CtxindexAuthError) return authErrorExit(err)
  if (err instanceof CtxindexSyncError) {
    if (err.code === 'not_found') return 2
    if (err.code === 'unknown' || err.code === 'not_implemented_yet') return 50
    return mapSyncErrorCode(err.code).exitCode
  }

  const code = (err as { code?: string }).code
  if (code === 'invalid_args') return 2
  if (code === 'invalid_arg' || code === 'permission_denied') return 40
  if (code === 'conflict') return 20
  if (code === 'network' || code === 'network_error') return 30
  if (code === 'transient' || code === 'unknown') return 50
  if (code === 'cancelled') return 130
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') return 30
  if (code === 'invalid_ref') return 2
  if (code === 'unsupported_capability' || code === 'output_exists') return 2
  if (code === 'sync_unsupported') return 2
  if (code === 'adapter_unavailable') return 50
  if (code === 'UNKNOWN_ADAPTER' || code === 'unknown_adapter') return 2

  if (err instanceof CtxindexNotFoundError) return 2
  if (err instanceof CtxindexSecretsError && err.code === 'invalid_ref')
    return 2
  // SPEC §12: validation failures (including duplicate realm) are usage errors.
  if (err instanceof CtxindexValidationError) return 2

  // SPEC §12: stable exit codes only — an unexpected error is "other" (50),
  // never the non-stable exit code 1.
  return 50
}

export async function runWithExit(
  handler: () => number | Promise<number>,
): Promise<void> {
  try {
    process.exitCode = await handler()
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = mapErrorToExit(err)
  }
}
