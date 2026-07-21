import { expect, test } from 'bun:test'

interface PackageManifest {
  readonly name?: string
  readonly version?: string
  readonly private?: boolean
  readonly license?: string
  readonly homepage?: string
  readonly bugs?: { readonly url?: string }
  readonly bin?: Record<string, string>
  readonly files?: readonly string[]
  readonly engines?: Record<string, string>
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly trustedDependencies?: readonly string[]
  readonly scripts?: Record<string, string>
}

async function readManifest(path: string): Promise<PackageManifest> {
  return (await Bun.file(path).json()) as PackageManifest
}

test('the private monorepo builds one public installable ctxindex package', async () => {
  const root = await readManifest('package.json')
  const cli = await readManifest('apps/cli/package.json')

  expect(root.private).toBe(true)
  expect(root.name).not.toBe('ctxindex')
  expect(root.scripts?.['build:cli']).toBe('turbo run build --filter ctxindex')

  expect(cli).toMatchObject({
    name: 'ctxindex',
    version: '0.1.1',
    license: 'MIT',
    homepage: 'https://ctxindex.com',
    bugs: { url: 'https://github.com/barisgit/ctxindex/issues' },
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    engines: { bun: '1.3.14' },
  })
  expect(cli.files).toEqual([
    'dist/ctxindex.mjs',
    'dist/ctxindex-daemon',
    'README.md',
  ])
  expect(cli.private).not.toBe(true)
  expect(cli.scripts?.build).toBe('bun run build:package')
  expect(cli.scripts?.['build:package']).toBe(
    'bun ../../scripts/release/build-cli-package.ts',
  )
  expect(Object.values(cli.dependencies ?? {})).not.toContain('workspace:*')

  for (const dependency of [
    '@ctxindex/official',
    '@ctxindex/core',
    '@ctxindex/extension-sdk',
    'citty',
    'cli-table3',
    'zod',
  ]) {
    expect(cli.devDependencies?.[dependency]).toBeDefined()
  }
})

test('trusted-publisher guidance declares the npm publish action', async () => {
  for (const path of [
    'docs/release/npm.md',
    'openspec/changes/ship-installable-npm-cli/implementation.md',
    'openspec/specs/cli-distribution/implementation.md',
  ]) {
    expect(await Bun.file(path).text()).toContain(
      'Allowed actions: `npm publish`',
    )
  }
})
