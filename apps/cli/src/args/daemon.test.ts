import { expect, test } from 'bun:test'
import { parseDaemonArgs } from './daemon'

test.each([
  [['serve'], { kind: 'serve' }],
  [['health'], { kind: 'health', json: false }],
  [['health', '--json'], { kind: 'health', json: true }],
  [['shutdown'], { kind: 'shutdown', json: false }],
  [['shutdown', '--json'], { kind: 'shutdown', json: true }],
] as const)('parses daemon lifecycle grammar %#', (args, expected) => {
  expect(parseDaemonArgs([...args])).toEqual(expected)
})

test.each([
  [[], 'daemon: expected serve, health, or shutdown'],
  [['start'], 'daemon: expected serve, health, or shutdown'],
  [['serve', '--json'], 'daemon serve: unknown flag --json'],
  [['health', 'extra'], 'daemon health: unexpected argument: extra'],
  [['health', '--json', '--json'], 'daemon health: duplicate --json'],
  [['shutdown', '--unknown'], 'daemon shutdown: unknown flag --unknown'],
] as const)('rejects malformed daemon grammar %#', (args, message) => {
  expect(parseDaemonArgs([...args])).toEqual({ kind: 'unknown', message })
})
