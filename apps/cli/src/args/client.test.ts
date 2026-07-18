import { expect, test } from 'bun:test'
import { parseClientArgs } from './client'

test('parses the client lifecycle without argv credentials', () => {
  expect(parseClientArgs(['add', 'google', '--from-env'])).toEqual({
    kind: 'add',
    provider: 'google',
  })
  expect(
    parseClientArgs(['add', 'google', '--label', 'work', '--from-env']),
  ).toEqual({ kind: 'add', provider: 'google', label: 'work' })
  expect(parseClientArgs(['list'])).toEqual({ kind: 'list', json: false })
  expect(parseClientArgs(['list', '--json'])).toEqual({
    kind: 'list',
    json: true,
  })
  expect(parseClientArgs(['remove', 'google', 'work'])).toEqual({
    kind: 'remove',
    provider: 'google',
    label: 'work',
  })
})

test('rejects missing mode and literal credential options', () => {
  expect(parseClientArgs(['add', 'google'])).toMatchObject({ kind: 'unknown' })
  expect(
    parseClientArgs(['add', 'google', '--client-secret', 'secret']),
  ).toMatchObject({ kind: 'unknown' })
  expect(parseClientArgs(['remove', 'google'])).toMatchObject({
    kind: 'unknown',
  })
  expect(parseClientArgs(['list', '--json=true'])).toEqual({
    kind: 'unknown',
    message: 'client list: --json does not take a value',
  })
  expect(parseClientArgs(['list', '--verbose'])).toMatchObject({
    kind: 'unknown',
  })
})
