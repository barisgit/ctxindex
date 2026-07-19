import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discoverWorkspacePackages,
  extractPackageImports,
  packageNameFromSpecifier,
  verifyWorkspaceDependencies,
} from './package-dependencies'

let fixtureRoot: string | undefined

afterEach(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = undefined
})

test('rejects forbidden declared directions even when the dependency is unused', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/extension-sdk/package.json'),
    JSON.stringify({
      name: '@ctxindex/extension-sdk',
      dependencies: { '@ctxindex/core': 'workspace:*', ky: 'latest' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@ctxindex/core', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/extension-sdk/src/index.ts'),
    'export {}',
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'external-direction',
      packageName: '@ctxindex/extension-sdk',
      dependency: 'ky',
    },
    {
      type: 'unused-dependency',
      packageName: '@ctxindex/extension-sdk',
      dependency: '@ctxindex/core',
    },
    {
      type: 'unused-dependency',
      packageName: '@ctxindex/extension-sdk',
      dependency: 'ky',
    },
    {
      type: 'workspace-direction',
      packageName: '@ctxindex/extension-sdk',
      dependency: '@ctxindex/core',
    },
  ])
})

test('applications may depend on public packages but not on sibling applications', async () => {
  fixtureRoot = await createFixtureRoot()
  for (const [directory, name, dependencies] of [
    ['packages/core', '@ctxindex/core', []],
    ['apps/worker', '@ctxindex/worker', []],
    ['apps/cli', '@ctxindex/cli', ['@ctxindex/core', '@ctxindex/worker']],
  ] as const) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({
        name,
        dependencies: Object.fromEntries(
          dependencies.map((dependency) => [dependency, 'workspace:*']),
        ),
      }),
    )
    await writeFixture(
      join(fixtureRoot, directory, 'src/index.ts'),
      dependencies.map((dependency) => `import '${dependency}'`).join('\n'),
    )
  }

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'workspace-direction',
      packageName: '@ctxindex/cli',
      dependency: '@ctxindex/worker',
    },
  ])
})

async function writeFixture(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-package-dependencies-'))
  await writeFixture(
    join(root, 'package.json'),
    JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }),
  )
  return root
}

test('discovers package files under apps/* and packages/* without a source allowlist', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/cli/package.json'),
    JSON.stringify({ name: '@fixture/cli', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/cli/src/main.ts'),
    "import 'citty'",
  )
  await writeFixture(
    join(fixtureRoot, 'apps/cli/tests/colocated.test.ts'),
    "import 'bun:test'",
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@fixture/core', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/extra/nested.mts'),
    "import 'zod'",
  )
  await writeFixture(
    join(fixtureRoot, 'examples/skipped/package.json'),
    JSON.stringify({ name: 'skipped' }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/dist/skipped.js'),
    "import 'ignored'",
  )

  const packages = await discoverWorkspacePackages(fixtureRoot)
  const root = fixtureRoot

  expect(packages.map((workspacePackage) => workspacePackage.name)).toEqual([
    '@fixture/cli',
    '@fixture/core',
  ])
  expect(
    packages
      .flatMap((workspacePackage) => workspacePackage.files)
      .map((file) => file.slice(root.length + 1)),
  ).toEqual([
    'apps/cli/src/main.ts',
    'apps/cli/tests/colocated.test.ts',
    'packages/core/extra/nested.mts',
  ])
})

test('extracts static, re-export, dynamic import, and require specifiers only from syntax', () => {
  const source = `
    import value from 'plain-package'
    import type { Type } from '@scope/types/subpath'
    export { named } from '@scope/reexport/subpath'
    export * from 'star-package/subpath'
    const lazy = import('dynamic-package/feature')
    const attributed = import('attributed-package/feature', { with: { type: 'json' } })
    const loaded = require('@scope/required/feature')
    import assigned = require('import-equals-package/feature')
    type Imported = import('import-type-package/feature').Imported
    const text = "import 'not-an-import'"
    const template = \`require('template-package')\`
    // require('comment-package')
    /* export * from 'block-comment-package' */
    import(variable)
    require(variable)
    import 'z-package'
    import 'a-package'
    import 'A-package'
    import '_package'
  `

  expect(extractPackageImports(source, 'fixture.ts')).toEqual([
    '@scope/reexport',
    '@scope/required',
    '@scope/types',
    'A-package',
    '_package',
    'a-package',
    'attributed-package',
    'dynamic-package',
    'import-equals-package',
    'import-type-package',
    'plain-package',
    'star-package',
    'z-package',
  ])
})

test('normalizes scoped and subpath packages and ignores builtins and relative files', () => {
  expect(packageNameFromSpecifier('@scope/package/subpath')).toBe(
    '@scope/package',
  )
  expect(packageNameFromSpecifier('package/subpath')).toBe('package')
  expect(packageNameFromSpecifier('node:fs')).toBeUndefined()
  expect(packageNameFromSpecifier('fs')).toBeUndefined()
  expect(packageNameFromSpecifier('fs/promises')).toBeUndefined()
  expect(packageNameFromSpecifier('bun:test')).toBeUndefined()
  expect(packageNameFromSpecifier('./local')).toBeUndefined()
  expect(packageNameFromSpecifier('/absolute/file')).toBeUndefined()
  expect(packageNameFromSpecifier('#internal')).toBeUndefined()
})

test('rejects undeclared and unused runtime dependencies', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/extension-sdk/package.json'),
    JSON.stringify({
      name: '@ctxindex/extension-sdk',
      dependencies: { unused: 'latest', zod: 'latest' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/extension-sdk/src/index.ts'),
    "import { z } from 'zod'; import 'missing-package'",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'external-direction',
      packageName: '@ctxindex/extension-sdk',
      dependency: 'unused',
    },
    {
      type: 'undeclared-dependency',
      packageName: '@ctxindex/extension-sdk',
      dependency: 'missing-package',
    },
    {
      type: 'unused-dependency',
      packageName: '@ctxindex/extension-sdk',
      dependency: 'unused',
    },
  ])
})

test('checks web workspaces and reports ordinary undeclared imports', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({ name: 'web', dependencies: { next: 'latest' } }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.tsx'),
    "import Link from 'next/link'; import 'undeclared-web-package'; export default Link",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'undeclared-dependency',
      packageName: 'web',
      dependency: 'undeclared-web-package',
    },
  ])
})

test('accepts web aliases, generated directories, framework imports, and declared peers', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({
      name: 'web',
      dependencies: {
        'fumadocs-core': 'latest',
        'lucide-react': 'latest',
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        paths: { '@/*': ['./*'], 'collections/*': ['./.source/*'] },
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.tsx'),
    [
      "import Link from 'next/link'",
      "import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'",
      "import local from '@/lib/local'",
      "import generated from 'collections/server'",
      "import type { MDXComponents } from 'mdx/types'",
      'lucideIconsPlugin()',
      'export default <Link href={local}>{generated as unknown as MDXComponents}</Link>',
    ].join('\n'),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/.next/types/generated.ts'),
    "import 'generated-only-package'",
  )
  await writeFixture(
    join(fixtureRoot, 'node_modules/next/package.json'),
    JSON.stringify({
      name: 'next',
      peerDependencies: { react: '*', 'react-dom': '*' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'node_modules/fumadocs-core/package.json'),
    JSON.stringify({
      name: 'fumadocs-core',
      peerDependencies: { 'lucide-react': '*' },
      peerDependenciesMeta: { 'lucide-react': { optional: true } },
    }),
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('matches exact aliases without suppressing package-name prefixes', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({ name: 'web', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { react: ['./shim.ts'] } } }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.ts'),
    "import local from 'react'; import external from 'react-dom'; export { local, external }",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'undeclared-dependency',
      packageName: 'web',
      dependency: 'react-dom',
    },
  ])
})

test('reads local aliases from valid commented and trailing-comma tsconfig JSONC', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({ name: 'web', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/tsconfig.json'),
    `{
      // TypeScript configuration files use JSONC.
      "compilerOptions": {
        "paths": { "@/*": ["./*"] },
      },
    }`,
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.ts'),
    "import local from '@/lib/local'; export default local",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('does not exempt aliases targeting node_modules or sibling applications', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/worker/package.json'),
    JSON.stringify({ name: '@fixture/worker', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/worker/src/index.ts'),
    'export const worker = true',
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({ name: 'web', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        baseUrl: '..',
        paths: {
          'external/*': ['web/node_modules/external/*'],
          '@fixture/worker/*': ['worker/*'],
        },
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.ts'),
    "import 'external/value'; import '@fixture/worker/runtime'",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'undeclared-dependency',
      packageName: 'web',
      dependency: '@fixture/worker',
    },
    {
      type: 'undeclared-dependency',
      packageName: 'web',
      dependency: 'external',
    },
    {
      type: 'workspace-direction',
      packageName: 'web',
      dependency: '@fixture/worker',
    },
  ])
})

test('does not treat unrelated optional framework peers as used', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/web/package.json'),
    JSON.stringify({
      name: 'web',
      dependencies: {
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
        sass: 'latest',
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/web/app/page.ts'),
    "import Link from 'next/link'; export default Link",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([
    {
      type: 'unused-dependency',
      packageName: 'web',
      dependency: 'sass',
    },
  ])
})

test('rejects workspace dependencies outside the accepted direction', async () => {
  fixtureRoot = await createFixtureRoot()
  const manifests = [
    ['packages/extension-sdk', '@ctxindex/extension-sdk'],
    ['packages/profiles', '@ctxindex/profiles'],
    ['packages/core', '@ctxindex/core'],
    ['packages/adapters', '@ctxindex/adapters'],
    ['apps/cli', '@ctxindex/cli'],
  ] as const
  for (const [directory, name] of manifests) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({ name, dependencies: {} }),
    )
  }
  const invalidEdges = [
    ['packages/extension-sdk', '@ctxindex/extension-sdk', '@ctxindex/core'],
    ['packages/profiles', '@ctxindex/profiles', '@ctxindex/core'],
    ['packages/core', '@ctxindex/core', '@ctxindex/profiles'],
    ['packages/adapters', '@ctxindex/adapters', '@ctxindex/cli'],
  ] as const
  for (const [directory, name, dependency] of invalidEdges) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({ name, dependencies: { [dependency]: 'workspace:*' } }),
    )
    await writeFixture(
      join(fixtureRoot, directory, 'src/index.ts'),
      `export * from '${dependency}/subpath'`,
    )
  }

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual(
    invalidEdges
      .map(([, name, dependency]) => ({
        type: 'workspace-direction' as const,
        packageName: name,
        dependency,
      }))
      .sort(
        (left, right) =>
          left.packageName.localeCompare(right.packageName) ||
          left.dependency.localeCompare(right.dependency),
      ),
  )
})

test('accepts the established downward workspace dependency direction', async () => {
  fixtureRoot = await createFixtureRoot()
  const packages = [
    ['packages/extension-sdk', '@ctxindex/extension-sdk', ['zod']],
    [
      'packages/profiles',
      '@ctxindex/profiles',
      ['@ctxindex/extension-sdk', 'zod'],
    ],
    ['packages/core', '@ctxindex/core', ['@ctxindex/extension-sdk']],
    [
      'packages/adapters',
      '@ctxindex/adapters',
      ['@ctxindex/core', '@ctxindex/extension-sdk', '@ctxindex/profiles'],
    ],
    [
      'apps/cli',
      '@ctxindex/cli',
      [
        '@ctxindex/adapters',
        '@ctxindex/core',
        '@ctxindex/extension-sdk',
        '@ctxindex/profiles',
        'citty',
      ],
    ],
  ] as const
  for (const [directory, name, dependencies] of packages) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({
        name,
        dependencies: Object.fromEntries(
          dependencies.map((dependency) => [dependency, 'workspace:*']),
        ),
      }),
    )
    await writeFixture(
      join(fixtureRoot, directory, 'src/index.ts'),
      dependencies.map((dependency) => `import '${dependency}'`).join('\n'),
    )
  }

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})
