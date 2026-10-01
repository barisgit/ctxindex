import { expect, test } from 'bun:test'
import {
  isSyncError,
  type SyncError,
  type SyncErrorCode,
  syncError,
} from './sync-error'

const codes = [
  'auth_expired',
  'auth_revoked',
  'rate_limited',
  'network',
  'provider_unavailable',
  'provider_bad_response',
  'provider_quota',
  'not_found',
  'permission_denied',
  'cancelled',
  'unknown',
  'not_implemented_yet',
] as const satisfies readonly SyncErrorCode[]

test('syncError creates a frozen portable public failure for every stable code', () => {
  for (const code of codes) {
    const failure: SyncError = syncError(code, `Public ${code} failure.`)
    expect(failure).toEqual({
      kind: 'ctxindex.sync-error',
      code,
      message: `Public ${code} failure.`,
    })
    expect(Object.isFrozen(failure)).toBe(true)
    expect(isSyncError({ ...failure })).toBe(true)
  }

  expect(
    syncError('rate_limited', 'Retry later.', { retryAfterMs: 60_000 }),
  ).toEqual({
    kind: 'ctxindex.sync-error',
    code: 'rate_limited',
    message: 'Retry later.',
    retryAfterMs: 60_000,
  })
})

test('syncError rejects unbounded diagnostics and structural impersonation', () => {
  expect(() => syncError('network', '')).toThrow(TypeError)
  expect(() => syncError('network', 'private\npath')).toThrow(TypeError)
  expect(() => syncError('network', 'x'.repeat(513))).toThrow(TypeError)
  expect(() =>
    syncError('rate_limited', 'Retry later.', { retryAfterMs: 60_001 }),
  ).toThrow(TypeError)

  expect(isSyncError(new Error('provider body'))).toBe(false)
  expect(
    isSyncError({
      kind: 'ctxindex.sync-error',
      code: 'network',
      message: 'Public failure.',
      cause: new Error('private'),
    }),
  ).toBe(false)
  expect(
    isSyncError({
      kind: 'ctxindex.sync-error',
      code: 'not-a-code',
      message: 'Public failure.',
    }),
  ).toBe(false)
})
