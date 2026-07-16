import { expect, test } from 'bun:test'
import { parseAccountArgs } from './account'

test('parses only account list with an optional JSON flag', () => {
  expect(parseAccountArgs(['list'])).toEqual({ kind: 'list', json: false })
  expect(parseAccountArgs(['list', '--json'])).toEqual({
    kind: 'list',
    json: true,
  })
  expect(parseAccountArgs(['--help'])).toEqual({ kind: 'help' })
})

test.each([
  { args: [] },
  { args: ['list', '--json', '--json'] },
  { args: ['list', '--format', 'table'] },
  { args: ['list', 'extra'] },
  { args: ['add'] },
  { args: ['auth', 'list'] },
])('rejects unsupported account inventory arguments: $args', ({ args }) => {
  expect(parseAccountArgs([...args])).toMatchObject({ kind: 'unknown' })
})
