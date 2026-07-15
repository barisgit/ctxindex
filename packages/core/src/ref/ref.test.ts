import { describe, expect, test } from 'bun:test'
import { parseRef } from './ref'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

describe('parseRef', () => {
  test('preserves a valid opaque suffix byte-for-byte', () => {
    const ref = `ctx://${sourceId}/a%2Fb:@!$&'()*+,;=~`
    expect(parseRef(ref)).toEqual({
      sourceId,
      suffix: "a%2Fb:@!$&'()*+,;=~",
      ref,
    })
  })

  test.each([
    `https://${sourceId}/a`,
    `ctx://${sourceId.toLowerCase()}/a`,
    `ctx://01ARZ3NDEKTSV4RRFFQ69G5FAI/a`,
    `ctx://${sourceId}/`,
    `ctx://${sourceId}/raw space`,
    `ctx://${sourceId}/é`,
    `ctx://${sourceId}/lower%2fescape`,
    `ctx://${sourceId}/bad%XX`,
    `ctx://${sourceId}/${'a'.repeat(16 * 1024 + 1)}`,
  ])('rejects invalid Ref %s', (ref) => {
    expect(() => parseRef(ref)).toThrow()
  })
})
