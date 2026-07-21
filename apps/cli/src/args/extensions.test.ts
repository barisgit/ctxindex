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
        'fixture.extension',
        '--json',
      ]),
    ).toEqual({
      kind: 'catalog-show',
      name: 'team',
      extensionId: 'fixture.extension',
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

  test('parses Catalog build, Marketplace search, install, and uninstall', () => {
    expect(
      parseExtensionsArgs([
        'catalog',
        'build',
        '/tmp/catalog',
        '--catalog',
        'fixture.catalog',
        '--output',
        '/tmp/catalog/ctxindex-catalog.json',
        '--trust',
        '--json',
      ]),
    ).toEqual({
      kind: 'catalog-build',
      packageRoot: '/tmp/catalog',
      catalogId: 'fixture.catalog',
      output: '/tmp/catalog/ctxindex-catalog.json',
      trust: true,
      json: true,
    })
    expect(parseExtensionsArgs(['search', 'calendar', '--json'])).toEqual({
      kind: 'search',
      query: 'calendar',
      noRefresh: false,
      json: true,
    })
    expect(parseExtensionsArgs(['search', '--no-refresh'])).toEqual({
      kind: 'search',
      noRefresh: true,
      json: false,
    })
    expect(
      parseExtensionsArgs([
        'install',
        'team',
        'fixture.extension',
        '--trust',
        '--json',
      ]),
    ).toEqual({
      kind: 'catalog-install',
      catalog: 'team',
      extensionId: 'fixture.extension',
      trust: true,
      noRefresh: false,
      json: true,
    })
    expect(
      parseExtensionsArgs(['uninstall', 'fixture.extension', '--json']),
    ).toEqual({
      kind: 'uninstall',
      extensionId: 'fixture.extension',
      force: false,
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
        'fixture.extension',
        '--trust',
        '--no-refresh',
      ]),
    ).toEqual({
      kind: 'catalog-install',
      catalog: 'team',
      extensionId: 'fixture.extension',
      trust: true,
      noRefresh: true,
      json: false,
    })
  })

  test('reports the versionless Catalog show usage exactly', () => {
    expect(parseExtensionsArgs(['catalog', 'show'])).toEqual({
      kind: 'unknown',
      message: 'extensions catalog show: expected <name> [<extension-id>]',
    })
  })

  test('reports Catalog build output as a manifest file path', () => {
    expect(parseExtensionsArgs(['catalog', 'build'])).toEqual({
      kind: 'unknown',
      message:
        'extensions catalog build: expected <package-root> [--catalog <id>] [--output <manifest-path>]',
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
      kind: 'uninstall',
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
      parseExtensionsArgs(['install', catalog, 'fixture.extension', '--trust']),
    ).toMatchObject({ kind: 'catalog-install', catalog })
  })

  test.each([
    ['catalog', 'add', 'team', '/tmp/repo', '--ref', 'refs/heads/main'],
    ['install', 'team', 'fixture.extension'],
    ['install', 'team', 'fixture.extension@1', '--trust'],
    ['install', 'team', 'fixture.extension'],
    ['uninstall', 'fixture.extension@1'],
    ['catalog', 'show', 'team', 'fixture.extension@x'],
    ['catalog', 'build'],
    ['catalog', 'build', '/tmp/package'],
    ['catalog', 'build', '/tmp/package', '--unknown'],
    ['search', 'one', 'two'],
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
