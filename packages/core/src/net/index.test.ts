import { describe, expect, test } from 'bun:test'
import { CtxindexError } from '../errors'
import { assertEgressAllowed } from './index'

describe('network egress policy', () => {
  test.each([
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    'https://oauth2.googleapis.com/token',
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://www.googleapis.com/gmail/v1/users/me/messages',
  ])('allows production Gmail endpoint %s', (url) => {
    expect(() => assertEgressAllowed(url)).not.toThrow()
  })

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
