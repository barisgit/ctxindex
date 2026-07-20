import { expect, test } from 'bun:test'
import { parseOAuthAppArgs } from './oauth-app'

test('parses the OAuth App lifecycle without argv configuration', () => {
  expect(parseOAuthAppArgs(['add', 'google', 'desktop', '--from-env'])).toEqual(
    { kind: 'add', provider: 'google', label: 'desktop' },
  )
  expect(parseOAuthAppArgs(['list'])).toEqual({ kind: 'list', json: false })
  expect(parseOAuthAppArgs(['list', '--json'])).toEqual({
    kind: 'list',
    json: true,
  })
  expect(parseOAuthAppArgs(['remove', 'google', 'desktop'])).toEqual({
    kind: 'remove',
    provider: 'google',
    label: 'desktop',
  })
})

test('rejects missing labels, literal configuration, and malformed flags', () => {
  for (const args of [
    ['add', 'google', '--from-env'],
    ['add', 'google', 'desktop'],
    ['add', 'google', 'desktop', '--client-id', 'secret'],
    ['remove', 'google'],
    ['list', '--verbose'],
  ]) {
    expect(parseOAuthAppArgs(args)).toMatchObject({ kind: 'unknown' })
  }
  expect(parseOAuthAppArgs(['list', '--json=true'])).toEqual({
    kind: 'unknown',
    message: 'oauth-app list: --json does not take a value',
  })
})
