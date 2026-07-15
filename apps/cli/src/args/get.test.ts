import { describe, expect, test } from 'bun:test'
import { parseGetArgs } from './get'

describe('parseGetArgs', () => {
  test('parses a canonical Ref and JSON mode', () => {
    expect(
      parseGetArgs([
        'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/message-1',
        '--json',
      ]),
    ).toEqual({
      kind: 'get',
      ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/message-1',
      json: true,
    })
  })

  test('parses JSON mode before the Ref', () => {
    expect(
      parseGetArgs([
        '--json',
        'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/message-1',
      ]),
    ).toEqual({
      kind: 'get',
      ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/message-1',
      json: true,
    })
  })

  test.each([
    [[], 'get: missing <ref>'],
    [['one', 'two'], 'get: expected exactly one <ref>'],
    [['not-a-ref'], 'get: invalid <ref>: not-a-ref'],
  ])('rejects invalid arguments', (args, message) => {
    expect(parseGetArgs(args)).toEqual({ kind: 'unknown', message })
  })
})
