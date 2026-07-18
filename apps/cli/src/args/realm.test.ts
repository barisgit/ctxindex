import { describe, expect, test } from 'bun:test'
import { parseRealmArgs } from './realm'

describe('realm arguments', () => {
  test('parses add with an optional display name and list JSON', () => {
    expect(parseRealmArgs(['add', 'personal'])).toEqual({
      kind: 'add',
      slug: 'personal',
    })
    expect(parseRealmArgs(['add', 'personal', '--name', 'Personal'])).toEqual({
      kind: 'add',
      slug: 'personal',
      name: 'Personal',
    })
    expect(parseRealmArgs(['add', 'personal', '--name', '-h'])).toEqual({
      kind: 'add',
      slug: 'personal',
      name: '-h',
    })
    expect(parseRealmArgs(['list'])).toEqual({ kind: 'list', json: false })
    expect(parseRealmArgs(['list', '--json'])).toEqual({
      kind: 'list',
      json: true,
    })
  })

  test.each([
    [['add'], 'realm add: missing <slug>'],
    [['add', 'personal', '--name'], 'realm add: --name requires a value'],
    [
      ['add', 'personal', '--name', 'Personal', '--name', 'Other'],
      'realm add: --name may be specified once',
    ],
    [['add', 'personal', 'extra'], 'realm add: unexpected argument "extra"'],
    [['add', 'personal', '--unknown'], 'realm add: unknown flag --unknown'],
    [['list', 'extra'], 'realm list: unexpected argument "extra"'],
    [['list', '--json', '--json'], 'realm list: --json may be specified once'],
    [['list', '--unknown'], 'realm list: unknown flag --unknown'],
  ])('rejects missing, repeated, and extra input', (args, message) => {
    expect(parseRealmArgs(args)).toEqual({ kind: 'unknown', message })
  })
})
