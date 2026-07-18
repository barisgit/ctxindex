import { describe, expect, test } from 'bun:test'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '../testing'
import {
  CATALOG_MANIFEST_MAX_BYTES,
  CATALOG_MAX_ENTRIES,
  CATALOG_PATH_MAX_BYTES,
  CATALOG_SETUP_MAX_BYTES,
  catalogSnapshotPath,
  parseCatalogManifest,
  validateCatalogSnapshot,
} from '.'

function manifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    catalog: { id: 'fixture.catalog', name: 'Fixture Catalog' },
    extensions: [
      {
        id: 'fixture.extension',
        version: 1,
        source: { kind: 'inline', path: 'extension.ts' },
        setup: { path: 'SETUP.md' },
      },
    ],
    ...overrides,
  }
}

describe('Catalog manifest schema', () => {
  test('parses the closed schema-version-1 shape', () => {
    expect(parseCatalogManifest(JSON.stringify(manifest()))).toEqual(
      manifest() as never,
    )
  })

  test.each([
    ['root', { forbidden: true }],
    [
      'catalog auth',
      { catalog: { id: 'fixture.catalog', name: 'Fixture', auth: {} } },
    ],
    [
      'extension scopes',
      {
        extensions: [
          {
            id: 'fixture.extension',
            version: 1,
            scopes: ['mail.read'],
            source: { kind: 'inline', path: 'extension.ts' },
          },
        ],
      },
    ],
    [
      'source config',
      {
        extensions: [
          {
            id: 'fixture.extension',
            version: 1,
            source: {
              kind: 'inline',
              path: 'extension.ts',
              config: {},
            },
          },
        ],
      },
    ],
  ])('rejects unknown fields: %s', (_label, override) => {
    expect(() =>
      parseCatalogManifest(JSON.stringify(manifest(override))),
    ).toThrow()
  })

  test('rejects duplicate Extension id and version tuples', () => {
    const entry = {
      id: 'fixture.extension',
      version: 1,
      source: { kind: 'inline', path: 'extension.ts' },
    }
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(manifest({ extensions: [entry, entry] })),
      ),
    ).toThrow('Duplicate Catalog Extension fixture.extension@1')
  })

  test('enforces manifest and entry bounds', () => {
    expect(() =>
      parseCatalogManifest(' '.repeat(CATALOG_MANIFEST_MAX_BYTES + 1)),
    ).toThrow('256 KiB')
    const entry = {
      id: 'fixture.extension',
      version: 1,
      source: { kind: 'inline', path: 'extension.ts' },
    }
    expect(() =>
      parseCatalogManifest(
        JSON.stringify(
          manifest({ extensions: Array(CATALOG_MAX_ENTRIES + 1).fill(entry) }),
        ),
      ),
    ).toThrow()
  })
})

describe('Catalog snapshot validation', () => {
  test('accepts normalized contained source and setup files', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'extension.ts'), 'export default () => ({})')
      await writeFile(join(root, 'SETUP.md'), 'Follow these steps.')
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(manifest()),
      )

      expect(await validateCatalogSnapshot(root)).toEqual(manifest() as never)
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    '',
    '/absolute.ts',
    '../escape.ts',
    'nested/../escape.ts',
    './extension.ts',
    'nested//extension.ts',
    'nested\\extension.ts',
    'extension.ts\0ignored',
    `${'a'.repeat(CATALOG_PATH_MAX_BYTES)}x`,
  ])('rejects unsafe source path %j', async (path) => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(
          manifest({
            extensions: [
              {
                id: 'fixture.extension',
                version: 1,
                source: { kind: 'inline', path },
              },
            ],
          }),
        ),
      )
      await expect(validateCatalogSnapshot(root)).rejects.toThrow()
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
      await symlink(join(sandbox.dir, 'outside.ts'), join(root, 'extension.ts'))
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(manifest()),
      )
      await writeFile(join(root, 'SETUP.md'), 'setup')
      await expect(validateCatalogSnapshot(root)).rejects.toThrow('escapes')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects an invalid UTF-8 manifest before JSON parsing', async () => {
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

  test('rejects setup files larger than 1 MiB', async () => {
    const sandbox = await createSandbox()
    try {
      const root = join(sandbox.dir, 'snapshot')
      await mkdir(root, { recursive: true })
      await writeFile(join(root, 'extension.ts'), 'source')
      await writeFile(
        join(root, 'SETUP.md'),
        'x'.repeat(CATALOG_SETUP_MAX_BYTES + 1),
      )
      await writeFile(
        join(root, 'ctxindex-catalog.json'),
        JSON.stringify(manifest()),
      )
      await expect(validateCatalogSnapshot(root)).rejects.toThrow('1 MiB')
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
