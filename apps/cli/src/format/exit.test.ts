import { describe, expect, test } from 'bun:test'
import {
  CtxindexAuthError,
  CtxindexError,
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import { mapErrorToExit } from './exit'

describe('mapErrorToExit', () => {
  test.each([
    'invalid_oauth_selection',
    'action_unsupported',
    'confirmation_required',
  ] as const)('maps validation %s to exit 2', (code) => {
    expect(mapErrorToExit(new CtxindexValidationError(code, code))).toBe(2)
  })

  test('keeps transient auth network failures on exit 30', () => {
    expect(
      mapErrorToExit(
        new CtxindexAuthError(
          'network_error',
          'Source Grant token resolution failed (network_error)',
        ),
      ),
    ).toBe(30)
  })

  test('maps an unavailable Extension Adapter to other sync failure', () => {
    expect(mapErrorToExit({ code: 'adapter_unavailable' })).toBe(50)
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
    ['auth_expired', 10],
    ['permission_denied', 40],
    ['not_found', 50],
    ['rate_limited', 20],
    ['provider_unavailable', 30],
    ['provider_bad_response', 30],
  ] as const)('maps provider taxonomy %s to exit %i', (code, exitCode) => {
    expect(mapErrorToExit(new CtxindexSyncError('provider failed', code))).toBe(
      exitCode,
    )
  })
})
