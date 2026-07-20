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

  test('parses the include-deleted local search flag', () => {
    expect(parseSearchArgs(['project', '--include-deleted', '--json'])).toEqual(
      {
        kind: 'search',
        json: true,
        refs: false,
        input: { text: 'project', includeDeleted: true },
      },
    )
    expect(parseSearchArgs(['--include-deleted', '--json'])).toEqual({
      kind: 'search',
      json: true,
      refs: false,
      input: { includeDeleted: true },
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

  test('accepts constrained query-less remote search and opaque continuation', () => {
    expect(
      parseSearchArgs([
        '--remote',
        '--source',
        'work-outlook',
        '--kind',
        'communication.message',
      ]),
    ).toEqual({
      kind: 'search',
      json: false,
      refs: false,
      input: {
        sourceIds: ['work-outlook'],
        kind: 'communication.message',
        remote: true,
      },
    })
    expect(
      parseSearchArgs([
        'quarterly',
        '--remote',
        '--source',
        'work-outlook',
        '--continuation',
        'opaque-next-page',
      ]),
    ).toMatchObject({
      kind: 'search',
      input: {
        text: 'quarterly',
        sourceIds: ['work-outlook'],
        remote: true,
        continuation: 'opaque-next-page',
      },
    })
  })

  test('rejects bare search and invalid pagination combinations', () => {
    expect(parseSearchArgs([])).toMatchObject({
      kind: 'unknown',
      message:
        'search: provide <query> or at least one filter (--realm/--adapter/--source/--kind/--field/--since/--until/--include-deleted)',
    })
    expect(parseSearchArgs(['--json'])).toMatchObject({ kind: 'unknown' })
    for (const args of [
      ['x', '--remote', '--source', 'a', '--continuation='],
      ['x', '--remote', '--source', 'a', '--continuation', '   '],
    ]) {
      expect(parseSearchArgs(args)).toMatchObject({
        kind: 'unknown',
        message: 'search: --continuation requires a token',
      })
    }
    expect(parseSearchArgs(['--remote', '--include-deleted'])).toMatchObject({
      kind: 'unknown',
      message:
        'search: query-less --remote requires a narrowing Realm, Adapter, Source, kind, field, or time filter',
    })
    expect(parseSearchArgs(['--realm', 'work', '--remote'])).toMatchObject({
      kind: 'search',
      input: { realms: ['work'], remote: true },
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
    for (const args of [
      ['x', '--continuation', 'next'],
      ['x', '--remote', '--continuation', 'next'],
      [
        'x',
        '--remote',
        '--source',
        'a',
        '--source',
        'b',
        '--continuation',
        'next',
      ],
      [
        'x',
        '--remote',
        '--source',
        'a',
        '--offset',
        '1',
        '--continuation',
        'next',
      ],
      ['x', '--local-only', '--source', 'a', '--continuation', 'next'],
    ]) {
      expect(parseSearchArgs(args)).toMatchObject({ kind: 'unknown' })
    }
  })
})
