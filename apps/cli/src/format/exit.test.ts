import { describe, expect, test } from 'bun:test'
import {
  CtxindexAuthError,
  type CtxindexAuthErrorCode,
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexSyncError,
  type CtxindexSyncErrorCode,
  CtxindexValidationError,
  type CtxindexValidationErrorCode,
} from '@ctxindex/core/errors'
import { DaemonCliError } from '../daemon/client'
import { mapErrorToExit } from './exit'

const validationCodes: CtxindexValidationErrorCode[] = [
  'invalid_account_identity',
  'invalid_oauth_selection',
  'duplicate_realm_slug',
  'unknown_realm',
  'invalid_filter',
  'invalid_ref',
  'invalid_artifact_ref',
  'invalid_artifact_retention',
  'unsupported_export_format',
  'ref_source_mismatch',
  'unknown_action',
  'invalid_action_input',
  'action_unsupported',
  'confirmation_required',
]

const authCases: readonly (readonly [CtxindexAuthErrorCode, number])[] = [
  ['needs_auth', 10],
  ['missing_oauth_app_config', 50],
  ['invalid_grant', 10],
  ['invalid_client', 10],
  ['oauth_failed', 10],
  ['oauth_host_denied', 50],
  ['insufficient_scope', 50],
  ['token_response_invalid', 50],
  ['identity_response_invalid', 50],
  ['authorization_denied', 50],
  ['loopback_timeout', 50],
  ['missing_code', 50],
  ['state_mismatch', 50],
  ['network_error', 30],
  ['token_refresh_failed', 50],
  ['unknown_auth_error', 50],
  ['unknown', 50],
  ['not_implemented_yet', 50],
]

const syncCases: readonly (readonly [CtxindexSyncErrorCode, number])[] = [
  ['auth_expired', 10],
  ['auth_revoked', 10],
  ['rate_limited', 20],
  ['network', 30],
  ['provider_unavailable', 30],
  ['provider_bad_response', 30],
  ['provider_quota', 30],
  ['not_found', 50],
  ['permission_denied', 40],
  ['cancelled', 130],
  ['unknown', 50],
  ['not_implemented_yet', 50],
]

function rpcError(
  taxonomy: 'auth' | 'sync' | 'validation' | 'lookup' | 'other',
  code: string,
): DaemonCliError {
  return new DaemonCliError({
    kind: 'ctxindex',
    taxonomy,
    code,
    message: code,
  })
}

describe('mapErrorToExit', () => {
  test.each([
    'invalid_oauth_selection',
    'action_unsupported',
    'confirmation_required',
  ] as const)('maps validation %s to exit 2', (code) => {
    expect(mapErrorToExit(new CtxindexValidationError(code, code))).toBe(2)
  })

  test.each(
    validationCodes,
  )('keeps direct and RPC validation %s on the same exit', (code) => {
    const direct = new CtxindexValidationError(code, code)
    const rpc = rpcError('validation', code)

    expect(mapErrorToExit(direct)).toBe(2)
    expect(mapErrorToExit(rpc)).toBe(mapErrorToExit(direct))
    expect(mapErrorToExit({ code })).toBe(2)
  })

  test.each(
    authCases,
  )('keeps direct and RPC auth %s on exit %i', (code, exitCode) => {
    expect(mapErrorToExit(new CtxindexAuthError(code, code))).toBe(exitCode)
    expect(mapErrorToExit(rpcError('auth', code))).toBe(exitCode)
    expect(mapErrorToExit({ code })).toBe(exitCode)
  })

  test.each(
    syncCases,
  )('keeps direct and RPC sync %s on exit %i', (code, exitCode) => {
    expect(mapErrorToExit(new CtxindexSyncError(code, code))).toBe(exitCode)
    expect(mapErrorToExit(rpcError('sync', code))).toBe(exitCode)
  })

  test('keeps lookup and sync not_found taxonomies distinct', () => {
    expect(mapErrorToExit(new CtxindexNotFoundError('missing'))).toBe(2)
    expect(mapErrorToExit(rpcError('lookup', 'not_found'))).toBe(2)
    expect(
      mapErrorToExit(new CtxindexSyncError('provider missing', 'not_found')),
    ).toBe(50)
    expect(mapErrorToExit(rpcError('sync', 'not_found'))).toBe(50)
    expect(mapErrorToExit({ code: 'not_found' })).toBe(2)
  })

  test('maps an unavailable Extension Adapter to other sync failure', () => {
    expect(mapErrorToExit({ code: 'adapter_unavailable' })).toBe(50)
  })

  test.each([
    'daemon_unavailable',
    'protocol_incompatible',
    'runtime_identity_mismatch',
    'database_lease_conflict',
    'prototype_unsupported',
    'shutdown_timeout',
    'result_too_large',
  ])('maps prototype daemon failure %s to exit 50', (code) => {
    expect(mapErrorToExit({ code })).toBe(50)
  })

  test('keeps daemon request cancellation on exit 130', () => {
    expect(mapErrorToExit({ code: 'cancelled' })).toBe(130)
  })

  test('normalizes a local AbortError to cancelled exit 130', () => {
    expect(
      mapErrorToExit(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
    ).toBe(130)
  })

  test('maps a code-only RPC invalid filter to the direct validation exit', () => {
    expect(mapErrorToExit({ code: 'invalid_filter' })).toBe(2)
  })

  test('maps a code-only RPC not found to the direct lookup exit', () => {
    expect(mapErrorToExit({ code: 'not_found' })).toBe(2)
  })

  test('maps terminal storage contention to the existing exit 50', () => {
    expect(
      mapErrorToExit(
        new CtxindexError(
          'Local storage remained unavailable; try again',
          'storage_busy',
        ),
      ),
    ).toBe(50)
  })

  test.each([
    ['unsupported_capability', 'other', 2],
    ['network', 'sync', 30],
  ] as const)('keeps direct and daemon-routed base failure %s through %s taxonomy on exit %i', (code, taxonomy, exitCode) => {
    const direct = new CtxindexError(code, code)
    const daemon = rpcError(taxonomy, code)
    expect(mapErrorToExit(direct)).toBe(exitCode)
    expect(mapErrorToExit(daemon)).toBe(exitCode)
  })
})
