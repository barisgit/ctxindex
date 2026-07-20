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
    expect(
      parseExtensionsArgs([
        'install',
        'npm',
        '@example/mail@^2',
        '--extension=example.mail',
      ]),
    ).toEqual({
      kind: 'direct-install',
      sourceKind: 'npm',
      target: '@example/mail@^2',
      extensionId: 'example.mail',
      json: false,
    })
    expect(parseExtensionsArgs(['catalog', 'list', '--json'])).toEqual({
      kind: 'catalog-list',
      noRefresh: false,
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
      noRefresh: false,
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
      kind: 'catalog-install',
      catalog: 'team',
      extension: { id: 'fixture.extension', version: 1 },
      trust: true,
      noRefresh: false,
      json: true,
    })
    expect(
      parseExtensionsArgs(['uninstall', 'fixture.extension@1', '--json']),
    ).toEqual({
      kind: 'catalog-uninstall',
      extension: { id: 'fixture.extension', version: 1 },
      json: true,
    })
  })

  test('parses explicit stored-snapshot discovery and install', () => {
    expect(
      parseExtensionsArgs(['catalog', 'list', '--no-refresh', '--json']),
    ).toEqual({ kind: 'catalog-list', noRefresh: true, json: true })
    expect(
      parseExtensionsArgs(['catalog', 'show', 'team', '--no-refresh']),
    ).toEqual({
      kind: 'catalog-show',
      name: 'team',
      noRefresh: true,
      json: false,
    })
    expect(
      parseExtensionsArgs([
        'install',
        'team',
        'fixture.extension@1',
        '--trust',
        '--no-refresh',
      ]),
    ).toEqual({
      kind: 'catalog-install',
      catalog: 'team',
      extension: { id: 'fixture.extension', version: 1 },
      trust: true,
      noRefresh: true,
      json: false,
    })
  })

  test('parses direct lifecycle commands without guessing target kinds', () => {
    expect(
      parseExtensionsArgs([
        'install',
        'npm',
        '@example/mail@^2',
        '--extension',
        'example.mail',
        '--json',
      ]),
    ).toEqual({
      kind: 'direct-install',
      sourceKind: 'npm',
      target: '@example/mail@^2',
      extensionId: 'example.mail',
      json: true,
    })
    expect(parseExtensionsArgs(['update', 'example.mail', '--json'])).toEqual({
      kind: 'direct-update',
      extensionId: 'example.mail',
      json: true,
    })
    expect(
      parseExtensionsArgs(['uninstall', 'example.mail', '--force', '--json']),
    ).toEqual({
      kind: 'direct-uninstall',
      extensionId: 'example.mail',
      force: true,
      json: true,
    })
  })

  test.each([
    'npm',
    'git',
    'local',
  ])('keeps %s available as a Catalog name', (catalog) => {
    expect(
      parseExtensionsArgs([
        'install',
        catalog,
        'fixture.extension@1',
        '--trust',
      ]),
    ).toMatchObject({ kind: 'catalog-install', catalog })
  })

  test.each([
    ['catalog', 'add', 'team', '/tmp/repo', '--ref', 'refs/heads/main'],
    ['install', 'team', 'fixture.extension@1'],
    ['install', 'team', 'fixture.extension'],
    ['uninstall', 'fixture.extension@0'],
    ['catalog', 'show', 'team', 'fixture.extension@x'],
    ['catalog', 'list', '--unknown'],
    ['install', 'npm', '@example/mail'],
    ['install', '@example/mail'],
    ['uninstall', 'fixture.extension@1', '--force'],
  ])('rejects malformed or untrusted arguments: %j', (...args) => {
    expect(
      parseExtensionsArgs(
        Array.from(args).filter((item) => typeof item === 'string') as string[],
      ),
    ).toMatchObject({ kind: 'unknown' })
  })
})
