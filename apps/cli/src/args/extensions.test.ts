import { describe, expect, test } from 'bun:test'
import { parseExtensionsArgs } from './extensions'

describe('parseExtensionsArgs Catalog surface', () => {
  test('parses Catalog lifecycle commands exactly', () => {
    expect(
      parseExtensionsArgs([
        'catalog',
        'add',
        'team',
        '/tmp/catalog.git',
        '--ref',
        'refs/heads/main',
        '--trust',
        '--json',
      ]),
    ).toEqual({
      kind: 'catalog-add',
      name: 'team',
      repository: '/tmp/catalog.git',
      ref: 'refs/heads/main',
      trust: true,
      json: true,
    })
    expect(parseExtensionsArgs(['catalog', 'list', '--json'])).toEqual({
      kind: 'catalog-list',
      json: true,
    })
    expect(
      parseExtensionsArgs([
        'catalog',
        'show',
        'team',
        'fixture.extension@2',
        '--json',
      ]),
    ).toEqual({
      kind: 'catalog-show',
      name: 'team',
      extension: { id: 'fixture.extension', version: 2 },
      json: true,
    })
    expect(parseExtensionsArgs(['catalog', 'refresh', 'team'])).toEqual({
      kind: 'catalog-refresh',
      name: 'team',
      json: false,
    })
    expect(parseExtensionsArgs(['catalog', 'remove', 'team'])).toEqual({
      kind: 'catalog-remove',
      name: 'team',
      json: false,
    })
  })

  test('parses install and uninstall exact selectors', () => {
    expect(
      parseExtensionsArgs([
        'install',
        'team',
        'fixture.extension@1',
        '--trust',
        '--json',
      ]),
    ).toEqual({
      kind: 'install',
      catalog: 'team',
      extension: { id: 'fixture.extension', version: 1 },
      trust: true,
      json: true,
    })
    expect(
      parseExtensionsArgs(['uninstall', 'fixture.extension@1', '--json']),
    ).toEqual({
      kind: 'uninstall',
      extension: { id: 'fixture.extension', version: 1 },
      json: true,
    })
  })

  test.each([
    ['catalog', 'add', 'team', '/tmp/repo', '--ref', 'refs/heads/main'],
    ['install', 'team', 'fixture.extension@1'],
    ['install', 'team', 'fixture.extension'],
    ['uninstall', 'fixture.extension@0'],
    ['catalog', 'show', 'team', 'fixture.extension@x'],
    ['catalog', 'list', '--unknown'],
  ])('rejects malformed or untrusted arguments: %j', (...args) => {
    expect(
      parseExtensionsArgs(
        Array.from(args).filter((item) => typeof item === 'string') as string[],
      ),
    ).toMatchObject({ kind: 'unknown' })
  })
})
