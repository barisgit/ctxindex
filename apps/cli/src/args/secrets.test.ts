import { expect, test } from 'bun:test'
import { parseSecretsArgs } from './secrets'

test('parses safe status and backend-set grammar', () => {
  expect(parseSecretsArgs(['status'])).toEqual({ kind: 'status', json: false })
  expect(parseSecretsArgs(['status', '--json'])).toEqual({
    kind: 'status',
    json: true,
  })
  expect(parseSecretsArgs(['backend', 'set', 'file'])).toEqual({
    kind: 'set',
    target: 'file',
  })
  expect(parseSecretsArgs(['backend', 'set', 'keychain'])).toEqual({
    kind: 'set',
    target: 'keychain',
  })
})

test('rejects legacy, value-bearing, repeated, and extra options without echoing values', () => {
  const inputs = [
    ['migrate', 'file'],
    ['backend', 'set', 'file', '--passphrase', 'SECRET-CANARY'],
    ['backend', 'set', 'file', '--passphrase=SECRET-CANARY'],
    ['status', '--json', '--json'],
    ['status', '--secret=SECRET-CANARY'],
    ['backend', 'set', 'file', '--json'],
    ['backend', 'set'],
    ['backend', 'set', 'other'],
    ['status', 'extra'],
  ]

  for (const input of inputs) {
    const parsed = parseSecretsArgs(input)
    expect(parsed.kind, input.join(' ')).toBe('unknown')
    expect(JSON.stringify(parsed)).not.toContain('SECRET-CANARY')
  }
})
