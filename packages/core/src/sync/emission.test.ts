import { expect, test } from 'bun:test'
import { parseSyncEmission } from './emission'

const ref = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/records/one'

const validResource = {
  ref,
  profile: { id: 'fake.record', version: 1 },
  completeness: 'complete' as const,
  title: null,
  summary: 'summary',
  occurredAt: 1,
  providerUpdatedAt: null,
  payload: { anything: true },
}

test('accepts each exact generic Sync emission envelope', () => {
  expect(
    parseSyncEmission({ type: 'upsertResource', resource: validResource }),
  ).toEqual({
    type: 'upsertResource',
    resource: validResource,
  })
  expect(parseSyncEmission({ type: 'removeResource', ref })).toEqual({
    type: 'removeResource',
    ref,
  })
  expect(
    parseSyncEmission({ type: 'checkpoint', cursor: { page: [1, null] } }),
  ).toEqual({
    type: 'checkpoint',
    cursor: { page: [1, null] },
  })
  expect(
    parseSyncEmission({
      type: 'warning',
      code: 'skip',
      message: 'Skipped',
      ref,
    }),
  ).toEqual({
    type: 'warning',
    code: 'skip',
    message: 'Skipped',
    ref,
  })
})

test.each([
  { type: 'removeResource', ref: '' },
  { type: 'warning', code: '', message: 'message' },
  { type: 'warning', code: 'code', message: '', ref: '' },
  { type: 'checkpoint', cursor: undefined },
  { type: 'checkpoint', cursor: 1n },
  { type: 'checkpoint', cursor: Number.NaN },
  { type: 'upsertResource', resource: { ...validResource, title: 1 } },
  {
    type: 'upsertResource',
    resource: { ...validResource, completeness: 'unknown' },
  },
  {
    type: 'upsertResource',
    resource: { ...validResource, profile: { id: '', version: 0 } },
  },
  {
    type: 'upsertResource',
    resource: { ...validResource, payload: undefined },
  },
])('rejects invalid Adapter emission %# as provider_bad_response', (emission) => {
  expect(() => parseSyncEmission(emission)).toThrow(
    expect.objectContaining({ code: 'provider_bad_response' }),
  )
})
