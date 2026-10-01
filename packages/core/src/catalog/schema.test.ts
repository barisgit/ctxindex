import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '../testing'
import {
  CATALOG_MANIFEST_MAX_BYTES,
  CATALOG_MAX_ENTRIES,
  CATALOG_PATH_MAX_BYTES,
  catalogSnapshotPath,
  parseCatalogManifest,
  validateCatalogSnapshot,
} from '.'

const digest = 'a'.repeat(64)
const lockBytes = new TextEncoder().encode('{"lockfileVersion":1}\n')
const lockDigest = createHash('sha256').update(lockBytes).digest('hex')
const lock = {
  format: 'bun.lock@1.3.14',
  path: `ctxindex-resolutions/${lockDigest}.json`,
  digest: lockDigest,
  byteLength: lockBytes.byteLength,
} as const

function replay(source: Record<string, unknown>) {
  return {
    source,
    packageRoot: 'package',
    materializationDigest: digest,
    lock,
  }
}

function manifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 2,
    catalog: { id: 'fixture.catalog', label: 'Fixture Catalog' },
    generated: { packageName: '@fixture/catalog', packageVersion: '1.0.0' },
    extensions: [
      {
        id: 'fixture.literal',
        summary: 'A literal Extension.',
        source: {
          kind: 'literal',
          authorPackage: replay({
            kind: 'local',
            requestedTarget: '.',
            path: '.',
            contentDigest: digest,
          }),
          locator: {
            module: 'index.ts',
            catalogId: 'fixture.catalog',
            entryIndex: 0,
            extensionId: 'fixture.literal',
          },
        },
      },
      {
        id: 'fixture.npm',
        source: {
          kind: 'package',
          replay: replay({
            kind: 'npm',
            requestedTarget: '@fixture/npm@^2',
            package: '@fixture/npm',
            version: '2.1.0',
            integrity: 'sha512-fixture',
          }),
        },
      },
      {
        id: 'fixture.git',
        source: {
          kind: 'package',
          replay: replay({
            kind: 'git',
            requestedTarget: 'git+https://example.test/fixture.git#main',
            repository: 'git+https://example.test/fixture.git',
            commit: 'b'.repeat(40),
          }),
        },
      },
      {
        id: 'fixture.local',
        source: {
          kind: 'package',
          replay: replay({
            kind: 'local',
            requestedTarget: './packages/local',
            path: 'packages/local',
            contentDigest: digest,
          }),
        },
      },
    ],
    ...overrides,
  }
}

async function writeValidSnapshot(root: string): Promise<void> {
  await mkdir(join(root, 'ctxindex-resolutions'), { recursive: true })
  await mkdir(join(root, 'packages', 'local'), { recursive: true })
  await writeFile(join(root, 'index.ts'), 'export {}\n')
  await writeFile(join(root, lock.path), lockBytes)
  await writeFile(
    join(root, 'ctxindex-catalog.json'),
    `${JSON.stringify(manifest())}\n`,
  )
}

describe('Catalog schema-v2 manifest', () => {
  test('parses the closed literal/npm/Git/local replay shape', () => {
    expect(parseCatalogManifest(JSON.stringify(manifest()))).toEqual(
      manifest() as never,
    )
  })

  test.each([
    [
      'git+ssh URL',
      'git+ssh://git@example.test/fixture.git#main',
      'git+ssh://git@example.test/fixture.git',
    ],
    [
      'scp-like SSH target',
      'git@example.test:fixture.git#main',
      'git@example.test:fixture.git',
    ],
  ])('accepts credential-free Git replay over %s', (_label, requestedTarget, repository) => {
    const extension = (manifest() as { extensions: Record<string, unknown>[] })
      .extensions[2]
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(
          manifest({
            extensions: [
              {
                ...extension,
                source: {
                  kind: 'package',
                  replay: replay({
                    kind: 'git',
                    requestedTarget,
                    repository,
                    commit: 'b'.repeat(40),
                  }),
                },
              },
            ],
          }),
        ),
      ),
    ).not.toThrow()
  })

  test.each([
    ['password', 'git+ssh://git:secret@example.test/fixture.git'],
    ['non-git SSH user', 'git+ssh://user@example.test/fixture.git'],
  ])('rejects a Git repository identity with %s', (_label, repository) => {
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(
          manifest({
            extensions: [
              {
                id: 'fixture.git',
                source: {
                  kind: 'package',
                  replay: replay({
                    kind: 'git',
                    requestedTarget: repository,
                    repository,
                    commit: 'b'.repeat(40),
                  }),
                },
              },
            ],
          }),
        ),
      ),
    ).toThrow('credentials')
  })

  test.each([
    ['schema v1', { schemaVersion: 1 }],
    ['unknown root field', { forbidden: true }],
    [
      'versioned Extension',
      {
        extensions: [
          {
            id: 'fixture.versioned',
            version: 1,
            source: {
              kind: 'package',
              replay: replay({
                kind: 'npm',
                requestedTarget: 'fixture@1',
                version: '1.0.0',
                integrity: 'sha512-fixture',
              }),
            },
          },
        ],
      },
    ],
    [
      'npm without integrity',
      {
        extensions: [
          {
            id: 'fixture.npm',
            source: {
              kind: 'package',
              replay: replay({
                kind: 'npm',
                requestedTarget: 'fixture@1',
                version: '1.0.0',
              }),
            },
          },
        ],
      },
    ],
    [
      'npm without package identity',
      {
        extensions: [
          {
            id: 'fixture.npm',
            source: {
              kind: 'package',
              replay: replay({
                kind: 'npm',
                requestedTarget: 'fixture@1',
                version: '1.0.0',
                integrity: 'sha512-fixture',
              }),
            },
          },
        ],
      },
    ],
    [
      'Git without repository identity',
      {
        extensions: [
          {
            id: 'fixture.git',
            source: {
              kind: 'package',
              replay: replay({
                kind: 'git',
                requestedTarget: 'git+https://example.test/fixture.git#main',
                commit: 'b'.repeat(40),
              }),
            },
          },
        ],
      },
    ],
    [
      'Git repository identity with credentials',
      {
        extensions: [
          {
            id: 'fixture.git',
            source: {
              kind: 'package',
              replay: replay({
                kind: 'git',
                requestedTarget: 'git@example.test:fixture.git#main',
                repository: 'user@example.test:fixture.git',
                commit: 'b'.repeat(40),
              }),
            },
          },
        ],
      },
    ],
    [
      'literal identity mismatch',
      {
        extensions: [
          {
            id: 'fixture.literal',
            source: {
              kind: 'literal',
              authorPackage: replay({
                kind: 'local',
                requestedTarget: '.',
                path: '.',
                contentDigest: digest,
              }),
              locator: {
                module: 'index.ts',
                catalogId: 'fixture.catalog',
                entryIndex: 0,
                extensionId: 'fixture.other',
              },
            },
          },
        ],
      },
    ],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      parseCatalogManifest(JSON.stringify(manifest(override))),
    ).toThrow()
  })

  test('rejects duplicate stable Extension ids and manifest bounds', () => {
    const entry = (manifest() as { extensions: unknown[] }).extensions[0]
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(manifest({ extensions: [entry, entry] })),
      ),
    ).toThrow('Duplicate Catalog Extension fixture.literal')
    expect(() =>
      parseCatalogManifest(' '.repeat(CATALOG_MANIFEST_MAX_BYTES + 1)),
    ).toThrow('256 KiB')
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(
          manifest({ extensions: Array(CATALOG_MAX_ENTRIES + 1).fill(entry) }),
        ),
      ),
    ).toThrow()
  })

  test('rejects conflicting metadata for a reused resolution path', () => {
    const candidate = structuredClone(manifest()) as {
      extensions: Array<{
        source:
          | { kind: 'literal'; authorPackage: { lock: typeof lock } }
          | { kind: 'package'; replay: { lock: typeof lock } }
      }>
    }
    const second = candidate.extensions[1]
    if (second?.source.kind !== 'package')
      throw new Error('missing package fixture')
    second.source.replay.lock = {
      ...lock,
      digest: 'b'.repeat(64),
    }
    expect(() => parseCatalogManifest(JSON.stringify(candidate))).toThrow(
      'Conflicting Catalog resolution artifact',
    )
  })
})

describe('Catalog schema-v2 snapshot validation', () => {
  test('validates contained modules, local packages, and exact lock bytes', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await writeValidSnapshot(root)
      expect(await validateCatalogSnapshot(root)).toEqual(manifest() as never)
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    '/absolute.ts',
    '../escape.ts',
    'nested/../escape.ts',
    './index.ts',
    'nested//index.ts',
    'nested\\index.ts',
    'index.ts\0ignored',
    `${'a'.repeat(CATALOG_PATH_MAX_BYTES)}x`,
  ])('rejects unsafe literal module path %j', async (module) => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      const candidate = structuredClone(manifest()) as {
        extensions: Array<{ source: { locator?: { module: string } } }>
      }
      const literal = candidate.extensions[0]
      if (literal?.source.locator === undefined)
        throw new Error('missing literal fixture')
      literal.source.locator.module = module
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(candidate),
      )
      await expect(validateCatalogSnapshot(root)).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects lock digest and byte-length mismatch', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await writeValidSnapshot(root)
      await writeFile(join(root, lock.path), 'changed\n')
      await expect(validateCatalogSnapshot(root)).rejects.toThrow(
        'resolution artifact',
      )
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects a symlink escaping the snapshot', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      await writeFile(join(sandbox.dir, 'outside.ts'), 'outside')
      await symlink(join(sandbox.dir, 'outside.ts'), join(root, 'index.ts'))
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(manifest()),
      )
      await expect(validateCatalogSnapshot(root)).rejects.toThrow('escapes')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects invalid UTF-8 before JSON parsing', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        new Uint8Array([0xc3, 0x28]),
      )
      await expect(validateCatalogSnapshot(root)).rejects.toThrow('UTF-8')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('derives portable snapshot paths without persisted absolute paths', () => {
    expect(catalogSnapshotPath('/portable/data', 'team', 'a'.repeat(40))).toBe(
      join('/portable/data', 'catalogs', 'team', 'a'.repeat(40)),
    )
    expect(() => catalogSnapshotPath('/data', '../team', 'abc')).toThrow()
  })
})
