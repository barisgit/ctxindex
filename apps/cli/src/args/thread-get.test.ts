import { describe, expect, test } from 'bun:test'
import { parseThreadGetArgs } from './thread-get'

const ref = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/message-1'

describe('parseThreadGetArgs', () => {
  test.each([
    [[ref, '--json'], true],
    [['--json', ref], true],
    [[ref], false],
  ] as const)('parses the exact Ref and JSON flag in either order', (args, json) => {
    expect(parseThreadGetArgs([...args])).toEqual({ kind: 'get', ref, json })
  })

  test.each([
    [[], 'thread get: missing <ref>'],
    [['one', 'two'], 'thread get: expected exactly one <ref>'],
    [['not-a-ref'], 'thread get: invalid <ref>: not-a-ref'],
  ])('rejects invalid arguments', (args, message) => {
    expect(parseThreadGetArgs(args)).toEqual({ kind: 'unknown', message })
  })
})
