import { expect, test } from 'bun:test'
import { parseAccountArgs } from './account'

test('parses account add, list, and label removal', () => {
  expect(
    parseAccountArgs(['add', 'google', '--app', 'desktop', '--label', 'work']),
  ).toEqual({
    kind: 'add',
    provider: 'google',
    label: 'work',
    app: 'desktop',
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
    ['add', 'google'],
    ['add', 'google', '--adapter', 'google.mailbox'],
    ['add', 'google', '--from-env'],
    ['add', 'google', '--client', 'desktop'],
    ['remove'],
    ['remove', 'work', 'extra'],
  ]) {
    expect(parseAccountArgs(args)).toMatchObject({ kind: 'unknown' })
  }
})
