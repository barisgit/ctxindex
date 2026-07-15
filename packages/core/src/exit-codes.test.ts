import { describe, expect, test } from 'bun:test'
import { EXIT_CODES, mapSyncErrorCode } from './exit-codes'

describe('SPEC §12 exit codes', () => {
  test('keeps the stable numeric contract', () => {
    expect(EXIT_CODES).toEqual({
      OK: 0,
      NEEDS_AUTH: 10,
      RATE_LIMITED: 20,
      NETWORK_ERROR: 30,
      PERMISSION_DENIED: 40,
      OTHER_FAILURE: 50,
      CANCELLED: 130,
    })
  })

  test.each([
    ['auth_expired', 10, 'failed', 'needs_auth'],
    ['auth_revoked', 10, 'failed', 'needs_auth'],
    ['rate_limited', 20, 'failed', 'failed'],
    ['network', 30, 'failed', 'failed'],
    ['provider_unavailable', 30, 'failed', 'failed'],
    ['provider_bad_response', 30, 'failed', 'failed'],
    ['provider_quota', 30, 'failed', 'failed'],
    ['permission_denied', 40, 'failed', 'failed'],
    ['cancelled', 130, 'cancelled', 'failed'],
    ['not_found', 50, 'failed', 'failed'],
    ['unknown', 50, 'failed', 'failed'],
  ] as const)('maps %s without requiring a sync implementation', (code, exitCode, runStatus, lastStatus) => {
    expect(mapSyncErrorCode(code)).toEqual({
      exitCode,
      runStatus,
      lastStatus,
    })
  })
})
