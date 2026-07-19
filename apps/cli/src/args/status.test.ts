import { expect, test } from 'bun:test'
import { parseStatusArgs } from './status'

test('parses status output flags strictly', () => {
  expect(parseStatusArgs([])).toEqual({
    kind: 'status',
    json: false,
    format: 'summary',
  })
  expect(
    parseStatusArgs(['--source=mail', '--format', 'compact', '--json']),
  ).toEqual({
    kind: 'status',
    sourceId: 'mail',
    json: true,
    format: 'compact',
  })
})

test.each([
  [['--unknown'], 'status: unknown flag --unknown'],
  [['unexpected'], 'status: unexpected argument: unexpected'],
  [['--source', 'one', '--source', 'two'], 'status: duplicate --source'],
  [['--format=summary', '--format=compact'], 'status: duplicate --format'],
  [['--json', '--json'], 'status: duplicate --json'],
  [['--json=true'], 'status: unknown flag --json'],
  [['--source'], 'status: --source requires a non-empty value'],
  [['--format'], 'status: --format requires a non-empty value'],
] as const)('rejects malformed status arguments %#', (args, message) => {
  expect(parseStatusArgs([...args])).toEqual({ kind: 'unknown', message })
})
