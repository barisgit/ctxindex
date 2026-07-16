import { expect, test } from 'bun:test'
import { parseAuthArgs } from './auth'

test('parses repeatable selected Adapters and exactly one provider-neutral mode', () => {
  expect(
    parseAuthArgs([
      'add',
      'example',
      '--adapter',
      'example.mail',
      '--adapter=example.calendar',
      '--loopback',
      '--client-id',
      'public-id',
      '--label',
      'Work',
    ]),
  ).toEqual({
    kind: 'add',
    provider: 'example',
    adapterIds: ['example.mail', 'example.calendar'],
    mode: 'loopback',
    clientId: 'public-id',
    label: 'Work',
  })
})

test.each([
  ['list'],
  ['add', 'example', '--loopback'],
  ['add', 'example', '--adapter', 'example.mail'],
  ['add', 'example', '--adapter', 'example.mail', '--loopback', '--from-env'],
  [
    'add',
    'example',
    '--adapter',
    'example.mail',
    '--client-secret',
    'literal',
    '--loopback',
  ],
  [
    'add',
    'example',
    '--adapter',
    'example.mail',
    '--auth-code',
    'literal',
    '--loopback',
  ],
  [
    'add',
    'example',
    '--adapter',
    'example.mail',
    '--refresh-token',
    'literal',
    '--loopback',
  ],
])('rejects removed or incomplete grammar: %j', (...args) => {
  expect(parseAuthArgs(args as string[]).kind).toBe('unknown')
})
