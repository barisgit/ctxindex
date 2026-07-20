import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertSafePackageFiles,
  classifyNativeKeytarProbe,
  createPublishManifest,
  packageContentManifest,
  packCliPackage,
  readPackageFiles,
} from './cli-package'

test('native keytar probe distinguishes a missing Linux host library', () => {
  expect(
    classifyNativeKeytarProbe('linux', {
      exitCode: 1,
      stdout: '',
      stderr:
        'error: libsecret-1.so.0: cannot open shared object file: No such file or directory',
    }),
  ).toBe('host-libsecret-unavailable')
  expect(
    classifyNativeKeytarProbe('darwin', {
      exitCode: 1,
      stdout: '',
      stderr:
        'error: libsecret-1.so.0: cannot open shared object file: No such file or directory',
    }),
  ).toBe('failed')
  expect(
    classifyNativeKeytarProbe('linux', {
      exitCode: 1,
      stdout: '',
      stderr: 'error: native keytar API unavailable',
    }),
  ).toBe('failed')
  expect(
    classifyNativeKeytarProbe('linux', {
      exitCode: 0,
      stdout: '',
      stderr: '',
    }),
  ).toBe('loaded')
})

test('publish metadata contains only the installable runtime contract', () => {
  const manifest = createPublishManifest({
    name: 'ctxindex',
    version: '1.2.3',
    description: 'CLI',
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    files: ['dist/ctxindex.mjs', 'README.md'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'apps/cli',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    devDependencies: { '@ctxindex/core': 'workspace:*' },
  })

  expect(manifest).toEqual({
    name: 'ctxindex',
    version: '1.2.3',
    description: 'CLI',
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    type: 'module',
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
    engines: { bun: '1.3.14' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/barisgit/ctxindex.git',
      directory: 'apps/cli',
    },
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    },
    dependencies: { keytar: '7.9.0' },
    trustedDependencies: ['keytar'],
  })
  expect(JSON.stringify(manifest)).not.toContain('workspace:')
})

test('safe package files have order-independent content manifests', () => {
  const manifest = JSON.stringify(
    createPublishManifest({
      name: 'ctxindex',
      version: '1.2.3',
      description: 'CLI',
      license: 'MIT',
      homepage: 'https://ctxindex.com',
      bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
      type: 'module',
      bin: { ctxindex: 'dist/ctxindex.mjs' },
      files: ['dist/ctxindex.mjs', 'README.md'],
      engines: { bun: '1.3.14' },
      repository: {
        type: 'git',
        url: 'git+https://github.com/barisgit/ctxindex.git',
        directory: 'apps/cli',
      },
      publishConfig: {
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
    }),
  )
  const files = [
    { path: 'package/LICENSE', content: 'MIT License\n' },
    { path: 'package/dist/ctxindex.mjs', content: '#!/usr/bin/env bun\n' },
    { path: 'package/README.md', content: '# ctxindex\n' },
    { path: 'package/package.json', content: manifest },
  ]

  expect(() => assertSafePackageFiles(files)).not.toThrow()
  expect(packageContentManifest(files)).toEqual(
    packageContentManifest([...files].reverse()),
  )
})

test.each([
  {
    name: 'unexpected source path',
    files: [
      { path: 'package/package.json', content: '{}' },
      { path: 'package/README.md', content: '# ctxindex' },
      { path: 'package/src/main.ts', content: 'source' },
    ],
  },
  {
    name: 'path traversal',
    files: [
      { path: 'package/package.json', content: '{}' },
      { path: 'package/README.md', content: '# ctxindex' },
      { path: 'package/../.env', content: 'NPM_TOKEN=secret' },
    ],
  },
  {
    name: 'workspace metadata',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          engines: { bun: '1.3.14' },
          dependencies: { '@ctxindex/core': 'workspace:*' },
        }),
      },
      { path: 'package/README.md', content: '# ctxindex' },
      { path: 'package/dist/ctxindex.mjs', content: '#!/usr/bin/env bun\n' },
    ],
  },
  {
    name: 'workspace runtime import',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          license: 'MIT',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
          engines: { bun: '1.3.14' },
          dependencies: { keytar: '7.9.0' },
          trustedDependencies: ['keytar'],
        }),
      },
      { path: 'package/LICENSE', content: 'MIT License\n' },
      { path: 'package/README.md', content: '# ctxindex' },
      {
        path: 'package/dist/ctxindex.mjs',
        content: '#!/usr/bin/env bun\nimport "@ctxindex/core"',
      },
    ],
  },
  {
    name: 'workspace metadata in executable',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          license: 'MIT',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
          engines: { bun: '1.3.14' },
          dependencies: { keytar: '7.9.0' },
          trustedDependencies: ['keytar'],
        }),
      },
      { path: 'package/LICENSE', content: 'MIT License\n' },
      { path: 'package/README.md', content: '# ctxindex' },
      {
        path: 'package/dist/ctxindex.mjs',
        content: '#!/usr/bin/env bun\nconst dependency = "workspace:*"',
      },
    ],
  },
  {
    name: 'source checkout path in executable',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          license: 'MIT',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
          engines: { bun: '1.3.14' },
          dependencies: { keytar: '7.9.0' },
          trustedDependencies: ['keytar'],
        }),
      },
      { path: 'package/LICENSE', content: 'MIT License\n' },
      { path: 'package/README.md', content: '# ctxindex' },
      {
        path: 'package/dist/ctxindex.mjs',
        content:
          '#!/usr/bin/env bun\nconst buildPath = "/home/runner/work/ctxindex/ctxindex/node_modules/pino/lib"',
      },
    ],
  },
  {
    name: 'development manifest in executable',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          license: 'MIT',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
          engines: { bun: '1.3.14' },
          dependencies: { keytar: '7.9.0' },
          trustedDependencies: ['keytar'],
        }),
      },
      { path: 'package/LICENSE', content: 'MIT License\n' },
      { path: 'package/README.md', content: '# ctxindex' },
      {
        path: 'package/dist/ctxindex.mjs',
        content:
          '#!/usr/bin/env bun\nconst manifest = { devDependencies: { typescript: "latest" } }',
      },
    ],
  },
  {
    name: 'secret content',
    files: [
      {
        path: 'package/package.json',
        content: JSON.stringify({
          name: 'ctxindex',
          license: 'MIT',
          bin: { ctxindex: 'dist/ctxindex.mjs' },
          files: ['dist/ctxindex.mjs', 'README.md', 'LICENSE'],
          engines: { bun: '1.3.14' },
          dependencies: { keytar: '7.9.0' },
          trustedDependencies: ['keytar'],
        }),
      },
      { path: 'package/LICENSE', content: 'MIT License\n' },
      {
        path: 'package/README.md',
        content: '-----BEGIN PRIVATE KEY-----',
      },
      { path: 'package/dist/ctxindex.mjs', content: '#!/usr/bin/env bun\n' },
    ],
  },
])('rejects $name', ({ files }) => {
  expect(() => assertSafePackageFiles(files)).toThrow()
})

test('packs allowlisted reproducible contents from unchanged source', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-package-test-'))
  try {
    const firstArchive = await packCliPackage(join(sandbox, 'first'))
    const secondArchive = await packCliPackage(join(sandbox, 'second'))
    const first = await readPackageFiles(firstArchive)
    const second = await readPackageFiles(secondArchive)

    expect(first.map(({ path }) => path).sort()).toEqual([
      'package/LICENSE',
      'package/README.md',
      'package/dist/ctxindex.mjs',
      'package/package.json',
    ])
    expect(() => assertSafePackageFiles(first)).not.toThrow()
    const executable = first.find(
      ({ path }) => path === 'package/dist/ctxindex.mjs',
    )
    expect(executable).toBeDefined()
    expect(new TextDecoder().decode(executable?.content)).not.toContain(
      'workspace:',
    )
    expect(new TextDecoder().decode(executable?.content)).not.toContain(
      process.cwd(),
    )
    expect(new TextDecoder().decode(executable?.content)).not.toContain(
      'devDependencies',
    )
    expect(new TextDecoder().decode(executable?.content)).not.toContain(
      'publishConfig',
    )
    expect(packageContentManifest(first)).toEqual(
      packageContentManifest(second),
    )
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
