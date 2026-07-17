import { expect, test } from 'bun:test'
import { parseAccountArgs } from './account'

test('parses account add, list, and label removal', () => {
  expect(parseAccountArgs(['add', 'google'])).toEqual({
    kind: 'add',
    provider: 'google',
  })
  expect(
    parseAccountArgs([
      'add',
      'google',
      '--label',
      'work',
      '--client',
      'desktop',
    ]),
  ).toEqual({
    kind: 'add',
    provider: 'google',
    label: 'work',
    client: 'desktop',
  })
  expect(parseAccountArgs(['list', '--json'])).toEqual({
    kind: 'list',
    json: true,
  })
  expect(parseAccountArgs(['remove', 'work'])).toEqual({
    kind: 'remove',
    label: 'work',
  })
})

test('rejects removed authorization vocabulary and malformed account commands', () => {
  for (const args of [
    ['add', 'google', '--adapter', 'google.mailbox'],
    ['add', 'google', '--from-env'],
    ['remove'],
    ['remove', 'work', 'extra'],
  ]) {
    expect(parseAccountArgs(args)).toMatchObject({ kind: 'unknown' })
  }
})
