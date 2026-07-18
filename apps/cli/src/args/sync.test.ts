import { expect, test } from 'bun:test'
import type { SyncMode } from '@ctxindex/extension-sdk'
import { parseSyncArgs } from './sync'

test('parses every public SyncMode and output flag', () => {
  const modes: SyncMode[] = ['sync', 'resync', 'diff']
  for (const mode of modes) {
    expect(
      parseSyncArgs(['--mode', mode, '--format', 'events', '--json']),
    ).toEqual({
      kind: 'run',
      mode,
      json: true,
      format: 'events',
    })
  }
})

test('preserves default, inline scalar, and help parsing', () => {
  expect(parseSyncArgs([])).toEqual({
    kind: 'run',
    mode: 'sync',
    json: false,
    format: 'summary',
  })
  expect(
    parseSyncArgs(['--source=notes', '--mode=diff', '--format=compact']),
  ).toEqual({
    kind: 'run',
    sourceId: 'notes',
    mode: 'diff',
    json: false,
    format: 'compact',
  })
  expect(parseSyncArgs(['--help', '--unknown'])).toEqual({ kind: 'help' })
})

test.each([
  [['--unknown'], 'sync: unknown flag --unknown'],
  [['unexpected'], 'sync: unexpected argument: unexpected'],
  [['--source', 'one', '--source', 'two'], 'sync: duplicate --source'],
  [['--mode', 'sync', '--mode=diff'], 'sync: duplicate --mode'],
  [['--format=summary', '--format', 'compact'], 'sync: duplicate --format'],
  [['--json', '--json'], 'sync: duplicate --json'],
  [['--json=true'], 'sync: unknown flag --json'],
  [['--source'], 'sync: --source requires a non-empty value'],
  [['--mode'], 'sync: --mode requires a non-empty value'],
  [['--format'], 'sync: --format requires a non-empty value'],
] as const)('rejects malformed arguments %#', (args, message) => {
  expect(parseSyncArgs([...args])).toEqual({ kind: 'unknown', message })
})
