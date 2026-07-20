import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  type DirectExtensionInstallationRecord,
  directExtensionDocumentSchema,
} from './schema'
import {
  DirectExtensionStore,
  directExtensionMaterializationPath,
  hashDirectory,
} from './store'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

function record(digest = 'a'.repeat(64)): DirectExtensionInstallationRecord {
  return {
    id: 'example.mail',
    source: {
      kind: 'npm',
      requested_target: '@example/mail@^2',
      package: '@example/mail',
      exact_version: '2.3.4',
      integrity: 'sha512-safe',
    },
    dependency_resolution: {
      format: 'bun.lock@1.3.14',
      digest: 'f'.repeat(64),
    },
    materialization_digest: digest,
    package_root: 'node_modules/@example/mail',
    installed_at: 10,
    updated_at: 20,
  }
}

describe('direct Extension records', () => {
  test('strictly parses versioned credential-free records', () => {
    const parsed = directExtensionDocumentSchema.parse({
      schema_version: 1,
      extensions: [record()],
    })
    expect(parsed.extensions[0]).toEqual(record())
    const { dependency_resolution: _, ...legacyRecord } = record()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [legacyRecord],
      }),
    ).toThrow()
    const npmSource = record().source
    if (npmSource.kind !== 'npm') throw new TypeError('Expected npm fixture')
    const { package: _package, ...npmWithoutPackage } = npmSource
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [{ ...record(), source: npmWithoutPackage }],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...record(),
            source: {
              kind: 'git',
              requested_target: 'git+https://example.com/repository.git#main',
              commit: 'b'.repeat(40),
            },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [{ ...record(), managed_path: '/private/state' }],
      }),
    ).toThrow()
    expect(
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...record(),
            id: 'example.git',
            source: {
              kind: 'git',
              requested_target: 'git+https://example.com/repository.git#main',
              repository: 'git+https://example.com/repository.git',
              commit: 'b'.repeat(40),
            },
          },
          {
            ...record(),
            id: 'example.local',
            source: {
              kind: 'local',
              requested_target: '/original/package',
              origin_path: '/original/package',
              content_digest: 'c'.repeat(64),
            },
          },
        ],
      }).extensions,
    ).toHaveLength(2)
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [{ ...record(), package_root: '/managed/package' }],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...record(),
            source: {
              ...record().source,
              requested_target: 'https://user:secret@example.com/pkg.tgz',
            },
          },
        ],
      }),
    ).toThrow()
  })

  test('strictly validates structured Catalog source locators', () => {
    const curated = {
      ...record(),
      curation: {
        extension_id: 'example.mail',
        catalog_name: 'example-catalog',
        catalog_id: 'example.catalog',
        repository: 'https://example.test/catalog.git',
        commit: 'c'.repeat(40),
        snapshot_acquired_at: 10,
        source_locator: { kind: 'package', entryIndex: 0 },
        execution_materialization_digest: record().materialization_digest,
      },
    }

    expect(
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [curated],
      }).extensions[0]?.curation?.source_locator,
    ).toEqual({ kind: 'package', entryIndex: 0 })
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...curated,
            curation: {
              ...curated.curation,
              source_locator: { kind: 'package', entryIndex: -1 },
            },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...curated,
            curation: {
              ...curated.curation,
              source_locator: { kind: 'package', entryIndex: 256 },
            },
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...curated,
            curation: {
              ...curated.curation,
              source_locator: {
                kind: 'literal',
                module: './catalog.ts',
                catalogId: 'example.catalog',
                entryIndex: 0,
                extensionId: 'other.extension',
              },
            },
          },
        ],
      }),
    ).toThrow()
  })

  test('fails managed loading closed when any record is invalid or duplicated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-strict-loading-'))
    roots.push(root)
    const store = new DirectExtensionStore({
      configRoot: join(root, 'config'),
      dataRoot: join(root, 'data'),
    })
    await mkdir(join(root, 'config'), { recursive: true })

    await writeFile(
      store.recordsPath,
      JSON.stringify({
        schema_version: 1,
        extensions: [record(), { id: 'invalid' }],
      }),
    )
    expect(await store.readRecordsForLoading()).toEqual({
      records: [],
      diagnostics: ['Direct Extension record document is invalid'],
    })

    await writeFile(
      store.recordsPath,
      JSON.stringify({
        schema_version: 1,
        extensions: [record(), record()],
      }),
    )
    expect(await store.readRecordsForLoading()).toEqual({
      records: [],
      diagnostics: ['Direct Extension record document is invalid'],
    })
  })

  test.each([
    'git+ssh://git@example.com/repository.git#main',
    'git@example.com:repository.git#main',
  ])('persists credential-free Git SSH target %s', async (requestedTarget) => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-ssh-'))
    roots.push(root)
    const store = new DirectExtensionStore({
      configRoot: join(root, 'config'),
      dataRoot: join(root, 'data'),
    })
    const installed = {
      ...record(),
      source: {
        kind: 'git' as const,
        requested_target: requestedTarget,
        repository: requestedTarget.replace(/#.*$/, ''),
        commit: 'b'.repeat(40),
      },
    }

    await store.writeRecords([installed])

    expect(await store.readRecords()).toEqual([installed])
  })

  test.each([
    'git+ssh://git:secret@example.com/repository.git',
    'git+ssh://user@example.com/repository.git',
    'user@example.com:repository.git',
    'git+ssh://g%69t@example.com/repository.git',
    'git+ssh://git:%73ecret@example.com/repository.git',
    'g%69t@example.com:repository.git',
    'git%3Asecret@example.com:repository.git',
  ])('rejects credentialed Git SSH target %s', (requestedTarget) => {
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...record(),
            source: {
              kind: 'git',
              requested_target: requestedTarget,
              repository: 'git+ssh://git@example.com/repository.git',
              commit: 'b'.repeat(40),
            },
          },
        ],
      }),
    ).toThrow()
  })

  test('derives managed paths from a digest without persisting them', () => {
    const path = directExtensionMaterializationPath('/data', 'b'.repeat(64))
    expect(path).toBe(
      join('/data', 'direct-extensions', 'materializations', 'b'.repeat(64)),
    )
    expect(isAbsolute(record().package_root)).toBe(false)
  })

  test('hashes directory contents deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-hash-'))
    roots.push(root)
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'b.txt'), 'two')
    await writeFile(join(root, 'nested', 'a.txt'), 'one')
    const first = await hashDirectory(root)
    const second = await hashDirectory(root)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
  })

  test('publishes immutably, replaces records atomically, and retains referenced materializations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-store-'))
    roots.push(root)
    const configRoot = join(root, 'config')
    const dataRoot = join(root, 'data')
    const store = new DirectExtensionStore({ configRoot, dataRoot })
    const staging = join(root, 'staging')
    await mkdir(staging)
    await writeFile(join(staging, 'index.ts'), 'export default 1')
    const digest = await hashDirectory(staging)
    const installed = record(digest)

    await Promise.all([
      store.publishMaterialization(staging, digest),
      store.publishMaterialization(staging, digest),
    ])
    await store.writeRecords([installed])
    expect(await store.readRecords()).toEqual([installed])
    expect(
      await readFile(
        join(directExtensionMaterializationPath(dataRoot, digest), 'index.ts'),
        'utf8',
      ),
    ).toBe('export default 1')

    await store.collectUnreferencedMaterializations()
    expect(
      await Bun.file(
        join(directExtensionMaterializationPath(dataRoot, digest), 'index.ts'),
      ).exists(),
    ).toBe(true)
  })

  test('serializes writers and removes only unreferenced materializations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-lock-'))
    roots.push(root)
    const options = {
      configRoot: join(root, 'config'),
      dataRoot: join(root, 'data'),
    }
    const first = new DirectExtensionStore(options)
    const second = new DirectExtensionStore(options)
    await Promise.all(
      [
        [first, { ...record('d'.repeat(64)), id: 'example.first' }],
        [second, { ...record('e'.repeat(64)), id: 'example.second' }],
      ].map(async ([store, value]) =>
        (store as DirectExtensionStore).withLifecycleLock(async () => {
          const current = await (store as DirectExtensionStore).readRecords()
          await (store as DirectExtensionStore).writeRecords([
            ...current,
            value as DirectExtensionInstallationRecord,
          ])
        }),
      ),
    )
    expect((await first.readRecords()).map(({ id }) => id)).toEqual([
      'example.first',
      'example.second',
    ])

    const referencedStage = join(root, 'referenced')
    const orphanStage = join(root, 'orphan')
    await mkdir(referencedStage)
    await mkdir(orphanStage)
    await writeFile(join(referencedStage, 'index.js'), 'referenced')
    await writeFile(join(orphanStage, 'index.js'), 'orphan')
    const referencedDigest = await hashDirectory(referencedStage)
    const orphanDigest = await hashDirectory(orphanStage)
    await first.publishMaterialization(referencedStage, referencedDigest)
    await first.publishMaterialization(orphanStage, orphanDigest)
    await first.writeRecords([record(referencedDigest)])
    await first.collectUnreferencedMaterializations()
    expect(
      await Bun.file(
        join(first.materializationsRoot, referencedDigest, 'index.js'),
      ).exists(),
    ).toBe(true)
    expect(
      await Bun.file(
        join(first.materializationsRoot, orphanDigest, 'index.js'),
      ).exists(),
    ).toBe(false)
  })
})
