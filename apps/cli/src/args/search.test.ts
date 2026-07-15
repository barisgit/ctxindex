import { describe, expect, test } from 'bun:test'
import { listFlag, parseFlags, stringFlag } from './flags'
import { parseSearchArgs } from './search'

describe('repeatable CLI flags', () => {
  test('keeps all values while stringFlag remains last-value deterministic', () => {
    const { flags } = parseFlags(['--field', 'sender=a', '--field=unread=true'])
    expect(listFlag(flags, 'field')).toEqual(['sender=a', 'unread=true'])
    expect(stringFlag(flags, 'field')).toBe('unread=true')
  })

  test('parses repeated typed fields and JSON search output', () => {
    expect(
      parseSearchArgs([
        'project',
        '--kind',
        'communication.message',
        '--field',
        'sender=alice@example.com',
        '--field=unread=true',
        '--remote',
        '--json',
      ]),
    ).toEqual({
      kind: 'search',
      json: true,
      refs: false,
      input: {
        text: 'project',
        kind: 'communication.message',
        fields: [
          { name: 'sender', value: 'alice@example.com' },
          { name: 'unread', value: 'true' },
        ],
        remote: true,
      },
    })
  })

  test('keeps a query after leading boolean flags', () => {
    expect(parseSearchArgs(['--json', '--remote', 'project'])).toEqual({
      kind: 'search',
      json: true,
      refs: false,
      input: { text: 'project', remote: true },
    })
  })

  test('rejects fields without kind and conflicting routing overrides', () => {
    expect(parseSearchArgs(['x', '--field', 'sender=a'])).toMatchObject({
      kind: 'unknown',
    })
    expect(parseSearchArgs(['x', '--remote', '--local-only'])).toMatchObject({
      kind: 'unknown',
    })
  })
})
