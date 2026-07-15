import { describe, expect, test } from 'bun:test'
import { CtxindexError } from '../errors'
import { assertEgressAllowed } from './index'

describe('network egress policy', () => {
  test('denial is a typed non-network policy failure', () => {
    let error: unknown
    try {
      assertEgressAllowed('https://not-allowlisted.example/path')
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(CtxindexError)
    expect(error).toMatchObject({ code: 'egress_denied' })
  })
})
