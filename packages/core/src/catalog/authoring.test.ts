import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defineCatalog,
  defineExtension,
  packageExtension,
} from '@ctxindex/extension-sdk'
import type { GenericExtensionPackageInstaller } from '../direct-extension'
import {
  buildCatalogSnapshot,
  type CatalogAuthoringInstaller,
  type CatalogAuthoringResolution,
  type CatalogAuthoringSelection,
} from './authoring'
import { searchMarketplace } from './marketplace'
import { validateCatalogSnapshot } from './paths'
import { catalogRecordSchema, parseCatalogManifest } from './schema'

const canonicalInstallerCompatibility: CatalogAuthoringInstaller =
  {} as GenericExtensionPackageInstaller
void canonicalInstallerCompatibility

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

const digest = 'a'.repeat(64)
const lockBytes = new TextEncoder().encode('{"lockfileVersion":1}\n')
const lockDigest = createHash('sha256').update(lockBytes).digest('hex')

async function fixturePackage(entries = ['./index.ts']) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-catalog-authoring-'))
  roots.push(root)
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@fixture/catalog',
      version: '1.2.3',
      ctxindex: { extensions: entries },
    }),
  )
  await writeFile(join(root, 'index.ts'), 'export {}\n')
  await mkdir(join(root, 'packages', 'local'), { recursive: true })
  return root
}

function replay(
  source: CatalogAuthoringResolution['replay']['source'],
): CatalogAuthoringResolution['replay'] {
  return {
    source,
    packageRoot: 'package',
    materializationDigest: digest,
  }
}

class FixtureInstaller implements CatalogAuthoringInstaller {
  readonly calls: Array<{
    readonly target: { readonly kind: string; readonly target: string }
    readonly selection: CatalogAuthoringSelection
    readonly immutableBaseRoot: string
  }> = []
  readonly disposed: CatalogAuthoringSelection[] = []
  readonly catalog = defineCatalog({
    id: 'fixture.catalog',
    label: 'Fixture Catalog',
    summary: 'A mixed Catalog.',
    entrySummaries: {
      'fixture.z-literal': 'Searchable literal calendar Extension.',
      'fixture.a-npm': 'Searchable package-backed mail Extension.',
    },
    extensions: [
      defineExtension({ id: 'fixture.z-literal' }),
      packageExtension(
        { kind: 'npm', target: '@fixture/npm@^2' },
        'fixture.a-npm',
      ),
      defineExtension({ id: 'fixture.y-literal' }),
      packageExtension(
        { kind: 'git', target: 'git+https://example.test/repo.git#main' },
        'fixture.m-git',
      ),
      packageExtension(
        { kind: 'local', target: './packages/local' },
        'fixture.b-local',
      ),
    ],
  })
  failExtensionId?: string

  async resolveForAuthoring(input: {
    readonly target: {
      readonly kind: 'npm' | 'git' | 'local'
      readonly target: string
    }
    readonly selection: CatalogAuthoringSelection
    readonly immutableBaseRoot: string
  }): Promise<CatalogAuthoringResolution> {
    this.calls.push(input)
    if (
      input.selection.kind === 'extension' &&
      input.selection.extensionId === this.failExtensionId
    ) {
      throw new Error('candidate failed')
    }
    const source =
      input.target.kind === 'npm'
        ? {
            kind: 'npm' as const,
            requestedTarget: input.target.target,
            package: '@fixture/npm',
            version: '2.1.0',
            integrity: 'sha512-fixture',
          }
        : input.target.kind === 'git'
          ? {
              kind: 'git' as const,
              requestedTarget: input.target.target,
              repository: input.target.target.replace(/#.*$/, ''),
              commit: 'b'.repeat(40),
            }
          : {
              kind: 'local' as const,
              requestedTarget:
                input.selection.kind === 'catalog'
                  ? '.'
                  : input.target.target.replace(/^\.\//, ''),
              path:
                input.selection.kind === 'catalog'
                  ? '.'
                  : input.target.target.replace(/^\.\//, ''),
              contentDigest: digest,
            }
    const shared = {
      replay: replay(source),
      dependencyResolutionArtifact: {
        format: 'bun.lock@1.3.14' as const,
        digest: lockDigest,
        bytes: lockBytes,
      },
      dispose: async () => {
        this.disposed.push(input.selection)
      },
    }
    return input.selection.kind === 'catalog'
      ? {
          ...shared,
          kind: 'catalog',
          selection: {
            ...input.selection,
            catalogId: this.catalog.id,
          },
          selectedRoot: this.catalog,
        }
      : {
          ...shared,
          kind: 'extension',
          extensionId: input.selection.extensionId,
          selection: input.selection,
          selectedRoot: defineExtension({ id: input.selection.extensionId }),
        }
  }
}

describe('Catalog snapshot authoring', () => {
  test('checks explicit author trust before reading or resolving the package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-untrusted-catalog-'))
    roots.push(root)
    const installer = new FixtureInstaller()
    const warnings: string[] = []

    await expect(
      buildCatalogSnapshot({
        packageRoot: root,
        outputPath: join(root, 'ctxindex-catalog.json'),
        catalogId: 'fixture.catalog',
        trusted: false,
        installer,
        warn: (message) => {
          warnings.push(message)
        },
      }),
    ).rejects.toThrow('trust')

    expect(installer.calls).toEqual([])
    expect(warnings).toEqual([])
    expect(await Bun.file(join(root, 'ctxindex-catalog.json')).exists()).toBe(
      false,
    )
  })

  test('builds a deterministic mixed schema-v2 snapshot through resolution only', async () => {
    const root = await fixturePackage()
    const installer = new FixtureInstaller()
    const events: string[] = []
    const outputPath = join(root, 'ctxindex-catalog.json')

    const result = await buildCatalogSnapshot({
      packageRoot: root,
      outputPath,
      catalogId: 'fixture.catalog',
      trusted: true,
      installer,
      warn: () => {
        events.push('warning')
      },
    })

    expect(events).toEqual(['warning'])
    expect(result.changed).toBe(true)
    expect(installer.calls[0]).toEqual({
      target: { kind: 'local', target: '.' },
      selection: {
        kind: 'catalog',
        module: 'index.ts',
        catalogId: 'fixture.catalog',
      },
      immutableBaseRoot: root,
    })
    expect(
      installer.calls.slice(1).map(({ target, selection }) => ({
        target,
        selection,
      })),
    ).toEqual([
      {
        target: { kind: 'npm', target: '@fixture/npm@^2' },
        selection: { kind: 'extension', extensionId: 'fixture.a-npm' },
      },
      {
        target: {
          kind: 'git',
          target: 'git+https://example.test/repo.git#main',
        },
        selection: { kind: 'extension', extensionId: 'fixture.m-git' },
      },
      {
        target: { kind: 'local', target: './packages/local' },
        selection: { kind: 'extension', extensionId: 'fixture.b-local' },
      },
    ])
    expect(installer.disposed).toHaveLength(4)

    const text = await readFile(outputPath, 'utf8')
    const manifest = parseCatalogManifest(text)
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      catalog: {
        id: 'fixture.catalog',
        label: 'Fixture Catalog',
        summary: 'A mixed Catalog.',
      },
      generated: {
        packageName: '@fixture/catalog',
        packageVersion: '1.2.3',
      },
    })
    expect(manifest.extensions.map(({ id }) => id)).toEqual([
      'fixture.a-npm',
      'fixture.b-local',
      'fixture.m-git',
      'fixture.y-literal',
      'fixture.z-literal',
    ])
    expect(
      manifest.extensions.find(({ id }) => id === 'fixture.a-npm')?.source,
    ).toMatchObject({
      kind: 'package',
      replay: { source: { kind: 'npm', package: '@fixture/npm' } },
    })
    expect(
      manifest.extensions.find(({ id }) => id === 'fixture.m-git')?.source,
    ).toMatchObject({
      kind: 'package',
      replay: {
        source: {
          kind: 'git',
          repository: 'git+https://example.test/repo.git',
        },
      },
    })
    expect(
      manifest.extensions.map(({ id, summary }) => ({ id, summary })),
    ).toEqual([
      {
        id: 'fixture.a-npm',
        summary: 'Searchable package-backed mail Extension.',
      },
      { id: 'fixture.b-local', summary: undefined },
      { id: 'fixture.m-git', summary: undefined },
      { id: 'fixture.y-literal', summary: undefined },
      {
        id: 'fixture.z-literal',
        summary: 'Searchable literal calendar Extension.',
      },
    ])
    const marketplace = searchMarketplace(
      [
        catalogRecordSchema.parse({
          name: 'fixture',
          repository: root,
          ref: 'refs/heads/main',
          commit: 'c'.repeat(40),
          snapshot_acquired_at: 1_000,
          catalog_id: manifest.catalog.id,
          catalog_label: manifest.catalog.label,
          ...(manifest.catalog.summary === undefined
            ? {}
            : { summary: manifest.catalog.summary }),
          generated: manifest.generated,
          extensions: manifest.extensions,
        }),
      ],
      'searchable',
      1_600,
    )
    expect(marketplace.map(({ id, summary }) => ({ id, summary }))).toEqual([
      {
        id: 'fixture.a-npm',
        summary: 'Searchable package-backed mail Extension.',
      },
      {
        id: 'fixture.z-literal',
        summary: 'Searchable literal calendar Extension.',
      },
    ])
    const literals = manifest.extensions.filter(
      (entry) => entry.source.kind === 'literal',
    )
    expect(literals.map((entry) => entry.source)).toEqual([
      {
        kind: 'literal',
        authorPackage: expect.objectContaining({
          source: expect.objectContaining({ kind: 'local', path: '.' }),
        }),
        locator: {
          module: 'index.ts',
          catalogId: 'fixture.catalog',
          entryIndex: 2,
          extensionId: 'fixture.y-literal',
        },
      },
      {
        kind: 'literal',
        authorPackage: expect.objectContaining({
          source: expect.objectContaining({ kind: 'local', path: '.' }),
        }),
        locator: {
          module: 'index.ts',
          catalogId: 'fixture.catalog',
          entryIndex: 0,
          extensionId: 'fixture.z-literal',
        },
      },
    ])
    expect(await readdir(join(root, 'ctxindex-resolutions'))).toEqual([
      `${lockDigest}.json`,
    ])
    expect(
      await readFile(join(root, 'ctxindex-resolutions', `${lockDigest}.json`)),
    ).toEqual(Buffer.from(lockBytes))

    const before = await stat(outputPath)
    const repeated = await buildCatalogSnapshot({
      packageRoot: root,
      outputPath,
      catalogId: 'fixture.catalog',
      trusted: true,
      installer,
    })
    const after = await stat(outputPath)
    expect(repeated.changed).toBe(false)
    expect(await readFile(outputPath, 'utf8')).toBe(text)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    await expect(validateCatalogSnapshot(root)).resolves.toEqual(manifest)
  })

  test('preserves prior authoritative output when any candidate resolution fails', async () => {
    const root = await fixturePackage()
    const installer = new FixtureInstaller()
    installer.failExtensionId = 'fixture.m-git'
    const outputPath = join(root, 'ctxindex-catalog.json')
    await mkdir(join(root, 'ctxindex-resolutions'))
    await writeFile(join(root, 'ctxindex-resolutions', 'prior.json'), 'prior')
    await writeFile(outputPath, 'prior manifest\n')

    await expect(
      buildCatalogSnapshot({
        packageRoot: root,
        outputPath,
        catalogId: 'fixture.catalog',
        trusted: true,
        installer,
      }),
    ).rejects.toThrow('candidate failed')

    expect(await readFile(outputPath, 'utf8')).toBe('prior manifest\n')
    expect(
      await readFile(join(root, 'ctxindex-resolutions', 'prior.json')),
    ).toEqual(Buffer.from('prior'))
    expect(await readdir(join(root, 'ctxindex-resolutions'))).toEqual([
      'prior.json',
    ])
    expect(installer.disposed).toHaveLength(2)
  })

  test('rejects duplicate stable ids before resolving entries or publishing output', async () => {
    const root = await fixturePackage()
    const installer = new FixtureInstaller()
    Object.defineProperty(installer, 'catalog', {
      value: {
        kind: 'catalog',
        id: 'fixture.catalog',
        label: 'Fixture Catalog',
        extensions: [
          defineExtension({ id: 'fixture.duplicate' }),
          {
            kind: 'package-extension',
            source: { kind: 'npm', target: '@fixture/duplicate@^1' },
            extensionId: 'fixture.duplicate',
          },
        ],
      },
    })
    const outputPath = join(root, 'ctxindex-catalog.json')

    await expect(
      buildCatalogSnapshot({
        packageRoot: root,
        outputPath,
        catalogId: 'fixture.catalog',
        trusted: true,
        installer,
      }),
    ).rejects.toThrow('Duplicate Catalog Extension id fixture.duplicate')

    expect(installer.calls).toEqual([
      {
        target: { kind: 'local', target: '.' },
        selection: {
          kind: 'catalog',
          module: 'index.ts',
          catalogId: 'fixture.catalog',
        },
        immutableBaseRoot: root,
      },
    ])
    expect(installer.disposed).toHaveLength(1)
    expect(await Bun.file(outputPath).exists()).toBe(false)
    await expect(
      readdir(join(root, 'ctxindex-resolutions')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('requires one declared module and lets the resolver select a sole Catalog root', async () => {
    const root = await fixturePackage(['./index.ts', './other.ts'])
    const installer = new FixtureInstaller()
    await expect(
      buildCatalogSnapshot({
        packageRoot: root,
        outputPath: join(root, 'ctxindex-catalog.json'),
        trusted: true,
        installer,
      }),
    ).rejects.toThrow('use a single Catalog entry module')
    expect(installer.calls).toEqual([])

    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: '@fixture/catalog',
        version: '1.2.3',
        ctxindex: { extensions: ['./index.ts'] },
      }),
    )
    await buildCatalogSnapshot({
      packageRoot: root,
      outputPath: join(root, 'ctxindex-catalog.json'),
      trusted: true,
      installer,
    })
    expect(installer.calls[0]?.selection).toEqual({
      kind: 'catalog',
      module: 'index.ts',
    })
  })
})
