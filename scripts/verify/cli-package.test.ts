import { expect, test } from 'bun:test'

interface PackageManifest {
  readonly name?: string
  readonly version?: string
  readonly private?: boolean
  readonly license?: string
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

  expect(cli).toMatchObject({
    name: 'ctxindex',
    version: '0.0.0',
    license: 'MIT',
    bin: { ctxindex: 'dist/ctxindex.mjs' },
    files: ['dist/ctxindex.mjs', 'README.md'],
    engines: { bun: '1.3.14' },
  })
  expect(cli.private).not.toBe(true)
  expect(cli.scripts?.build).toBe('bun run build:package')
  expect(cli.scripts?.['build:package']).toBe(
    'bun ../../scripts/release/build-cli-package.ts',
  )
  expect(Object.values(cli.dependencies ?? {})).not.toContain('workspace:*')

  for (const dependency of [
    '@ctxindex/adapters',
    '@ctxindex/core',
    '@ctxindex/extension-sdk',
    'citty',
    'cli-table3',
    'zod',
  ]) {
    expect(cli.devDependencies?.[dependency]).toBeDefined()
  }
})

test('contributor docs use Bun global link registration from the CLI workspace', async () => {
  for (const path of [
    'README.md',
    'CONTRIBUTING.md',
    '.agents/skills/repo-development/SKILL.md',
    'openspec/changes/ship-installable-npm-cli/implementation.md',
    'openspec/specs/cli-distribution/implementation.md',
  ]) {
    const content = await Bun.file(path).text()
    expect(content).toContain('bun link')
    expect(content).not.toContain('bun link --global')
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
