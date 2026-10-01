import {
  CtxindexAuthError,
  type CtxindexAuthErrorCode,
  CtxindexNotFoundError,
  CtxindexSyncError,
  type CtxindexSyncErrorCode,
  CtxindexValidationError,
  type CtxindexValidationErrorCode,
} from '@ctxindex/core/errors'
import { CtxindexSecretsError } from '@ctxindex/core/secrets'
import { mapSyncErrorCode } from '@ctxindex/core/sync'
import { DaemonCliError } from '../daemon/client'

const AUTH_ERROR_EXITS = {
  needs_auth: 10,
  missing_oauth_app_config: 50,
  invalid_grant: 10,
  invalid_client: 10,
  oauth_failed: 10,
  oauth_host_denied: 50,
  insufficient_scope: 50,
  token_response_invalid: 50,
  identity_response_invalid: 50,
  authorization_denied: 50,
  loopback_timeout: 50,
  missing_code: 50,
  state_mismatch: 50,
  network_error: 30,
  token_refresh_failed: 50,
  unknown_auth_error: 50,
  unknown: 50,
  not_implemented_yet: 50,
} as const satisfies Record<CtxindexAuthErrorCode, number>

const SYNC_ERROR_CODES = {
  auth_expired: true,
  auth_revoked: true,
  rate_limited: true,
  network: true,
  provider_unavailable: true,
  provider_bad_response: true,
  provider_quota: true,
  not_found: true,
  permission_denied: true,
  cancelled: true,
  unknown: true,
  not_implemented_yet: true,
} as const satisfies Record<CtxindexSyncErrorCode, true>

const VALIDATION_ERROR_CODES = {
  invalid_account_identity: true,
  invalid_oauth_selection: true,
  duplicate_realm_slug: true,
  unknown_realm: true,
  invalid_filter: true,
  invalid_ref: true,
  invalid_artifact_ref: true,
  invalid_artifact_retention: true,
  unsupported_export_format: true,
  ref_source_mismatch: true,
  unknown_action: true,
  invalid_action_input: true,
  action_unsupported: true,
  confirmation_required: true,
} as const satisfies Record<CtxindexValidationErrorCode, true>

function authErrorExit(code: string): number | undefined {
  if (!Object.hasOwn(AUTH_ERROR_EXITS, code)) return undefined
  return AUTH_ERROR_EXITS[code as CtxindexAuthErrorCode]
}

function syncErrorExit(code: string): number | undefined {
  if (!Object.hasOwn(SYNC_ERROR_CODES, code)) return undefined
  return mapSyncErrorCode(code as CtxindexSyncErrorCode).exitCode
}

function validationErrorExit(code: string): 2 | undefined {
  return Object.hasOwn(VALIDATION_ERROR_CODES, code) ? 2 : undefined
}

function codeOnlyErrorExit(code: string): number | undefined {
  const validation = validationErrorExit(code)
  if (validation !== undefined) return validation
  // A top-level code-only not_found is the lookup taxonomy. Sync transports
  // carry the explicit sync taxonomy so their not_found remains exit 50.
  if (code === 'not_found') return 2
  if (
    code === 'unsupported_capability' ||
    code === 'output_exists' ||
    code === 'sync_unsupported'
  )
    return 2
  if (code === 'conflict') return 20
  return authErrorExit(code) ?? syncErrorExit(code)
}

function daemonErrorExit(error: DaemonCliError): number | undefined {
  const { failure } = error
  if (failure.kind !== 'ctxindex') return undefined
  if (failure.taxonomy === 'auth') return authErrorExit(failure.code) ?? 50
  if (failure.taxonomy === 'sync') return syncErrorExit(failure.code) ?? 50
  if (failure.taxonomy === 'validation')
    return validationErrorExit(failure.code) ?? 50
  if (failure.taxonomy === 'lookup')
    return failure.code === 'not_found' ? 2 : 50
  return codeOnlyErrorExit(failure.code) ?? 50
}

export function mapErrorToExit(err: unknown): number {
  const explicit = (err as { exitCode?: number }).exitCode
  if (typeof explicit === 'number') return explicit

  if (err instanceof CtxindexAuthError) return authErrorExit(err.code) ?? 50
  if (err instanceof CtxindexSyncError) return syncErrorExit(err.code) ?? 50
  if (err instanceof CtxindexNotFoundError) return 2
  if (err instanceof CtxindexValidationError) return 2
  if (err instanceof DaemonCliError) {
    const mapped = daemonErrorExit(err)
    if (mapped !== undefined) return mapped
  }

  const code = (err as { code?: string }).code
  if (typeof code === 'string') {
    const mapped = codeOnlyErrorExit(code)
    if (mapped !== undefined) return mapped
  }
  if (code === 'invalid_args') return 2
  if (code === 'invalid_arg' || code === 'permission_denied') return 40
  if (code === 'conflict') return 20
  if (code === 'transient' || code === 'unknown') return 50
  if ((err as { name?: unknown }).name === 'AbortError') return 130
  if (
    code === 'daemon_unavailable' ||
    code === 'protocol_incompatible' ||
    code === 'runtime_identity_mismatch' ||
    code === 'database_lease_conflict' ||
    code === 'prototype_unsupported' ||
    code === 'shutdown_timeout' ||
    code === 'result_too_large'
  )
    return 50
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') return 30
  if (code === 'invalid_ref') return 2
  if (code === 'unsupported_capability' || code === 'output_exists') return 2
  if (code === 'sync_unsupported') return 2
  if (code === 'adapter_unavailable') return 50
  if (code === 'UNKNOWN_ADAPTER' || code === 'unknown_adapter') return 2
  if (
    code === 'extension_target_invalid' ||
    code === 'extension_trust_required' ||
    code === 'extension_removal_blocked'
  )
    return 2
  if (code === 'extension_acquisition_failed') return 30
  if (code === 'extension_validation_failed' || code === 'extension_conflict')
    return 50

  if (err instanceof CtxindexSecretsError && err.code === 'invalid_ref')
    return 2

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
