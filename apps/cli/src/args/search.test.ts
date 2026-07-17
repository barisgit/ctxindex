import { describe, expect, test } from 'bun:test'
import { parseSearchArgs } from './search'

describe('search CLI arguments', () => {
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

  test('accepts filter-only enumeration without query text', () => {
    expect(
      parseSearchArgs(['--realm', 'work', '--limit', '20', '--json']),
    ).toEqual({
      kind: 'search',
      json: true,
      refs: false,
      input: { realms: ['work'], limit: 20 },
    })
    expect(
      parseSearchArgs(['--kind', 'communication.message', '--offset', '20']),
    ).toEqual({
      kind: 'search',
      json: false,
      refs: false,
      input: { kind: 'communication.message', offset: 20 },
    })
  })

  test('rejects bare search, query-less --remote, and non-local --offset', () => {
    expect(parseSearchArgs([])).toMatchObject({
      kind: 'unknown',
      message:
        'search: provide <query> or at least one filter (--realm/--adapter/--source/--kind/--field/--since/--until)',
    })
    expect(parseSearchArgs(['--json'])).toMatchObject({ kind: 'unknown' })
    expect(parseSearchArgs(['--realm', 'work', '--remote'])).toMatchObject({
      kind: 'unknown',
      message:
        'search: --remote requires <query>; filter-only remote enumeration is not supported',
    })
    expect(parseSearchArgs(['x', '--offset', '5'])).toMatchObject({
      kind: 'unknown',
      message:
        'search: --offset requires local execution; omit <query> or add --local-only',
    })
    expect(
      parseSearchArgs(['x', '--local-only', '--offset', '5']),
    ).toMatchObject({
      kind: 'search',
      input: { text: 'x', localOnly: true, offset: 5 },
    })
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(
        parseSearchArgs(['--realm', 'work', '--offset', bad]),
      ).toMatchObject({
        kind: 'unknown',
        message: `search: invalid --offset: ${bad}`,
      })
    }
    expect(parseSearchArgs(['--realm', 'work', '--limit', '-1'])).toMatchObject(
      { kind: 'unknown', message: 'search: invalid --limit: -1' },
    )
  })
})
