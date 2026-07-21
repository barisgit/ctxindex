import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discoverWorkspacePackages,
  extractPackageImports,
  packageNameFromSpecifier,
  verifyWorkspaceDependencies,
} from '../../../scripts/verify/package-dependencies'

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

test('applications may declare bundled source imports as development dependencies', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@ctxindex/core', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/src/index.ts'),
    'export {}',
  )
  await writeFixture(
    join(fixtureRoot, 'apps/cli/package.json'),
    JSON.stringify({
      name: 'ctxindex',
      dependencies: { keytar: '7.9.0' },
      devDependencies: {
        '@ctxindex/core': 'workspace:*',
        citty: 'latest',
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/cli/src/index.ts'),
    "import '@ctxindex/core'; import 'citty'; import 'keytar'",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('example packages may use public packages as runtime or test dependencies', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'package.json'),
    JSON.stringify({ workspaces: ['packages/*', 'examples/*'] }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/extension-sdk/package.json'),
    JSON.stringify({ name: '@ctxindex/extension-sdk', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@ctxindex/core', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'examples/demo/package.json'),
    JSON.stringify({
      name: '@ctxindex/example-demo',
      dependencies: { '@ctxindex/extension-sdk': 'workspace:*' },
      devDependencies: { '@ctxindex/core': 'workspace:*' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'examples/demo/index.ts'),
    "import '@ctxindex/extension-sdk'",
  )
  await writeFixture(
    join(fixtureRoot, 'examples/demo/index.test.ts'),
    "import '@ctxindex/core'",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('rpc package rejects transport, lifecycle, storage, provider, formatting, and business imports', async () => {
  fixtureRoot = await createFixtureRoot()
  for (const [directory, name] of [
    ['packages/core', '@ctxindex/core'],
    ['packages/official', '@ctxindex/official'],
    ['packages/local-daemon', '@ctxindex/local-daemon'],
    ['apps/cli', '@ctxindex/cli'],
    ['apps/daemon', '@ctxindex/daemon'],
  ] as const) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({ name, dependencies: {} }),
    )
    await writeFixture(
      join(fixtureRoot, directory, 'src/index.ts'),
      'export {}',
    )
  }
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/package.json'),
    JSON.stringify({ name: '@ctxindex/rpc', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/src/router.ts'),
    `
import '@ctxindex/core'
import '@ctxindex/official'
import '@ctxindex/local-daemon'
import '@ctxindex/cli/src/formatters'
import '@ctxindex/daemon'
import 'bun'
import 'bun:sqlite'
import 'node:fs/promises'
import 'node:process'
import 'drizzle-orm/sqlite-core'

Bun.serve({ fetch: () => new Response() })
fetch('https://graph.microsoft.com/v1.0/me')
process.on('SIGTERM', () => {})
const query = 'SELECT * FROM sources'
void query
`,
  )

  expect(
    (await verifyWorkspaceDependencies(fixtureRoot)).filter(
      (violation) => violation.type === 'rpc-boundary',
    ),
  ).toEqual(
    [
      '@ctxindex/cli',
      '@ctxindex/cli/src/formatters',
      '@ctxindex/core',
      '@ctxindex/daemon',
      '@ctxindex/local-daemon',
      '@ctxindex/official',
      'Bun.serve',
      'bun',
      'bun:sqlite',
      'drizzle-orm/sqlite-core',
      'fetch',
      'node:fs/promises',
      'node:process',
      'package-private',
      'process',
      'provider-url:graph.microsoft.com',
      'raw-sql',
    ].map((dependency) => ({
      type: 'rpc-boundary' as const,
      packageName: '@ctxindex/rpc',
      dependency,
    })),
  )
})

test('rpc package accepts direct contract, schema, and procedure composition dependencies', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/package.json'),
    JSON.stringify({
      name: '@ctxindex/rpc',
      private: true,
      dependencies: {
        '@orpc/contract': 'latest',
        '@orpc/server': 'latest',
        zod: 'latest',
      },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/src/router.ts'),
    `
import { oc } from '@orpc/contract'
import { implement } from '@orpc/server'
import { z } from 'zod'

export const contract = oc.input(z.object({ value: z.string() }))
export const router = implement(contract).handler(({ input }) => input)
`,
  )
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/src/router.test.ts'),
    `
import { test } from 'bun:test'
test('router', () => {})
`,
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('rpc package rejects relative package escapes and non-base oRPC entrypoints', async () => {
  fixtureRoot = await createFixtureRoot()
  const coreSourcePath = join(fixtureRoot, 'packages/core/src/index.ts')
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@ctxindex/core', dependencies: {} }),
  )
  await writeFixture(coreSourcePath, 'export {}')
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/package.json'),
    JSON.stringify({
      name: '@ctxindex/rpc',
      private: true,
      dependencies: { '@orpc/server': 'latest', zod: 'latest' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/src/core-link.ts'),
    'export {}',
  )
  await rm(join(fixtureRoot, 'packages/rpc/src/core-link.ts'))
  await symlink(
    coreSourcePath,
    join(fixtureRoot, 'packages/rpc/src/core-link.ts'),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/rpc/src/router.ts'),
    `
import '../../core/src/index'
import './core-link'
import ${JSON.stringify(coreSourcePath)}
import { RPCHandler } from '@orpc/server/fetch'
import { z } from 'zod'

void RPCHandler
void z
`,
  )

  expect(
    (await verifyWorkspaceDependencies(fixtureRoot)).filter(
      (violation) => violation.type === 'rpc-boundary',
    ),
  ).toEqual(
    [
      '../../core/src/index',
      './core-link',
      coreSourcePath,
      '@orpc/server/fetch',
      'source-escape:src/core-link.ts',
    ].map((dependency) => ({
      type: 'rpc-boundary' as const,
      packageName: '@ctxindex/rpc',
      dependency,
    })),
  )
})

test('local daemon package rejects RPC, business, transport, formatting, provider, process, and storage imports', async () => {
  fixtureRoot = await createFixtureRoot()
  for (const [directory, name] of [
    ['packages/rpc', '@ctxindex/rpc'],
    ['packages/core', '@ctxindex/core'],
    ['packages/official', '@ctxindex/official'],
    ['apps/cli', '@ctxindex/cli'],
    ['apps/daemon', '@ctxindex/daemon'],
  ] as const) {
    await writeFixture(
      join(fixtureRoot, directory, 'package.json'),
      JSON.stringify({
        name,
        private: name === '@ctxindex/rpc' ? true : undefined,
        dependencies: {},
      }),
    )
    await writeFixture(
      join(fixtureRoot, directory, 'src/index.ts'),
      'export {}',
    )
  }
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/package.json'),
    JSON.stringify({ name: '@ctxindex/local-daemon', dependencies: {} }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/index.ts'),
    `
import '@ctxindex/rpc'
import '@ctxindex/core/src/sync/application-service'
import '@ctxindex/official'
import '@ctxindex/cli/src/formatters'
import '@ctxindex/daemon'
import '@orpc/server'
import 'bun'
import 'bun:ffi'
import 'bun:sqlite'
import 'node:child_process'
import 'node:process'
import 'drizzle-orm/sqlite-core'

Bun.serve({ fetch: () => new Response() })
fetch('https://oauth2.googleapis.com/token')
process.on('SIGTERM', () => {})
const query = 'DELETE FROM sources'
void query
`,
  )

  expect(
    (await verifyWorkspaceDependencies(fixtureRoot)).filter(
      (violation) => violation.type === 'local-daemon-boundary',
    ),
  ).toEqual(
    [
      '@ctxindex/cli',
      '@ctxindex/cli/src/formatters',
      '@ctxindex/core',
      '@ctxindex/daemon',
      '@ctxindex/official',
      '@ctxindex/rpc',
      '@orpc/server',
      'Bun.serve',
      'bun',
      'bun:ffi',
      'bun:sqlite',
      'drizzle-orm/sqlite-core',
      'fetch',
      'node:child_process',
      'node:process',
      'package-private',
      'process',
      'provider-url:oauth2.googleapis.com',
      'raw-sql',
    ].map((dependency) => ({
      type: 'local-daemon-boundary' as const,
      packageName: '@ctxindex/local-daemon',
      dependency,
    })),
  )
})

test('local daemon package accepts process-independent identity and lease primitives', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/package.json'),
    JSON.stringify({
      name: '@ctxindex/local-daemon',
      private: true,
      dependencies: {},
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/index.ts'),
    `
import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

export const digest = createHash('sha256').update(resolve(tmpdir())).digest('hex')
export const acquire = open
`,
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/lease.ts'),
    `
import { spawnSync } from 'node:child_process'
export const lock = spawnSync
`,
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/index.test.ts'),
    `
import { test } from 'bun:test'
test('identity', () => {})
`,
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
})

test('local daemon child process allowance is exact to the lease owner module', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/package.json'),
    JSON.stringify({
      name: '@ctxindex/local-daemon',
      private: true,
      dependencies: {},
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/internal/src/lease.ts'),
    "import { spawnSync } from 'node:child_process'; void spawnSync",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toContainEqual({
    type: 'local-daemon-boundary',
    packageName: '@ctxindex/local-daemon',
    dependency: 'node:child_process',
  })
})

test('local daemon package rejects relative imports that escape its package', async () => {
  fixtureRoot = await createFixtureRoot()
  const coreSourcePath = join(fixtureRoot, 'packages/core/src/index.ts')
  await writeFixture(
    join(fixtureRoot, 'packages/core/package.json'),
    JSON.stringify({ name: '@ctxindex/core', dependencies: {} }),
  )
  await writeFixture(coreSourcePath, 'export {}')
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/package.json'),
    JSON.stringify({
      name: '@ctxindex/local-daemon',
      private: true,
      dependencies: {},
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/core-link.ts'),
    'export {}',
  )
  await rm(join(fixtureRoot, 'packages/local-daemon/src/core-link.ts'))
  await symlink(
    coreSourcePath,
    join(fixtureRoot, 'packages/local-daemon/src/core-link.ts'),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/identity.ts'),
    "import '../../core/src/index'; import './core-link'",
  )

  expect(
    (await verifyWorkspaceDependencies(fixtureRoot)).filter(
      (violation) => violation.type === 'local-daemon-boundary',
    ),
  ).toEqual(
    [
      '../../core/src/index',
      './core-link',
      'source-escape:src/core-link.ts',
    ].map((dependency) => ({
      type: 'local-daemon-boundary',
      packageName: '@ctxindex/local-daemon',
      dependency,
    })),
  )
})

test('local daemon tests and testing helpers may spawn and terminate subprocesses', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/package.json'),
    JSON.stringify({
      name: '@ctxindex/local-daemon',
      private: true,
      dependencies: {},
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/lease.test.ts'),
    `
import { test } from 'bun:test'
import process from 'node:process'

test('kernel lease', () => {
  const child = Bun.spawn(['lease-contender'])
  process.kill(child.pid, 'SIGKILL')
})
`,
  )
  await writeFixture(
    join(fixtureRoot, 'packages/local-daemon/src/testing/subprocess.ts'),
    `
import { kill } from 'node:process'

export function spawnContender(): number {
  const child = Bun.spawn(['lease-contender'])
  kill(child.pid, 'SIGKILL')
  return child.pid
}
`,
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
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

test('does not attribute a nested fixture package to its containing workspace', async () => {
  fixtureRoot = await createFixtureRoot()
  await writeFixture(
    join(fixtureRoot, 'apps/cli/package.json'),
    JSON.stringify({ name: '@fixture/cli', dependencies: {} }),
  )
  await writeFixture(join(fixtureRoot, 'apps/cli/src/main.ts'), 'export {}')
  await writeFixture(
    join(fixtureRoot, 'apps/cli/fixtures/external/package.json'),
    JSON.stringify({
      name: '@fixture/external',
      dependencies: { 'external-only': 'latest' },
    }),
  )
  await writeFixture(
    join(fixtureRoot, 'apps/cli/fixtures/external/index.ts'),
    "import 'external-only'",
  )

  expect(await verifyWorkspaceDependencies(fixtureRoot)).toEqual([])
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
    ['packages/official', '@ctxindex/official'],
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
    ['packages/official', '@ctxindex/official', '@ctxindex/cli'],
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
      'packages/official',
      '@ctxindex/official',
      ['@ctxindex/core', '@ctxindex/extension-sdk', '@ctxindex/profiles'],
    ],
    [
      'apps/cli',
      '@ctxindex/cli',
      [
        '@ctxindex/official',
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
