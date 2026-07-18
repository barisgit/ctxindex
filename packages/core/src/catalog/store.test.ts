import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as TOML from '@iarna/toml'
import { createSandbox } from '../testing'
import {
  CATALOG_MAX_ENTRIES,
  type CatalogRecord,
  CatalogStore,
  type InstalledExtensionRecord,
} from '.'

const commit = 'a'.repeat(40)

const catalog: CatalogRecord = {
  name: 'fixture',
  repository: '/tmp/fixture.git',
  ref: 'refs/heads/main',
  commit,
  snapshot_acquired_at: 1,
  catalog_id: 'fixture.catalog',
  catalog_name: 'Fixture Catalog',
  extensions: [
    {
      id: 'fixture.extension',
      version: 1,
      source_path: 'extension.ts',
      setup_path: 'SETUP.md',
    },
  ],
}

const installed: InstalledExtensionRecord = {
  id: 'fixture.extension',
  version: 1,
  catalog_name: 'fixture',
  catalog_id: 'fixture.catalog',
  repository: '/tmp/fixture.git',
  commit,
  snapshot_acquired_at: 1,
  source_path: 'extension.ts',
  setup_path: 'SETUP.md',
}

describe('CatalogStore', () => {
  test('round-trips strict deterministic portable TOML records', async () => {
    const sandbox = await createSandbox()
    try {
      const store = new CatalogStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
      })
      await store.writeCatalogs([catalog])
      await store.writeInstalled([installed])

      expect(await store.readCatalogs()).toEqual([catalog])
      expect(await store.readInstalled()).toEqual([installed])
      const text = await Bun.file(store.installedPath).text()
      expect(text).not.toContain('snapshot_path')
      expect(text).not.toContain(sandbox.env.CTXINDEX_DATA_HOME)
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    'catalogs.toml',
    'installed-extensions.toml',
  ])('rejects unknown fields in %s', async (name) => {
    const sandbox = await createSandbox()
    try {
      const root = sandbox.env.CTXINDEX_CONFIG_HOME
      await mkdir(root, { recursive: true })
      const document =
        name === 'catalogs.toml'
          ? { schema_version: 1, catalogs: [], forbidden: true }
          : { schema_version: 1, extensions: [], forbidden: true }
      await writeFile(
        join(root, name),
        TOML.stringify(document as Parameters<typeof TOML.stringify>[0]),
      )
      const store = new CatalogStore({ configRoot: root })
      await expect(
        name === 'catalogs.toml' ? store.readCatalogs() : store.readInstalled(),
      ).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    ['name', '../fixture'],
    ['repository', 'https://user@example.com/catalog.git'],
    ['ref', '--upload-pack=credential-helper'],
    ['source_path', '../extension.ts'],
    ['setup_path', '/tmp/SETUP.md'],
  ] as const)('rejects invalid persisted Catalog %s', async (field, value) => {
    const sandbox = await createSandbox()
    try {
      const record = structuredClone(catalog) as Record<string, unknown>
      if (field === 'source_path' || field === 'setup_path') {
        const extension = (record.extensions as Record<string, unknown>[])[0]
        if (extension === undefined) throw new Error('Missing test Extension')
        extension[field] = value
      } else {
        record[field] = value
      }
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'catalogs.toml'),
        TOML.stringify({
          schema_version: 1,
          catalogs: [record],
        } as Parameters<typeof TOML.stringify>[0]),
      )

      await expect(
        new CatalogStore({
          configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        }).readCatalogs(),
      ).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    ['catalog_name', '../fixture'],
    ['repository', 'https://user@example.com/catalog.git'],
    ['source_path', '../extension.ts'],
    ['setup_path', '/tmp/SETUP.md'],
  ] as const)('rejects invalid persisted installed Extension %s', async (field, value) => {
    const sandbox = await createSandbox()
    try {
      const record = { ...installed, [field]: value }
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'installed-extensions.toml'),
        TOML.stringify({
          schema_version: 1,
          extensions: [record],
        } as Parameters<typeof TOML.stringify>[0]),
      )

      await expect(
        new CatalogStore({
          configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        }).readInstalled(),
      ).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects a persisted Catalog that exceeds the entry bound', async () => {
    const sandbox = await createSandbox()
    try {
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'catalogs.toml'),
        TOML.stringify({
          schema_version: 1,
          catalogs: [
            {
              ...catalog,
              extensions: Array.from(
                { length: CATALOG_MAX_ENTRIES + 1 },
                (_, index) => ({
                  id: `fixture.extension-${index}`,
                  version: 1,
                  source_path: 'extension.ts',
                }),
              ),
            },
          ],
        } as Parameters<typeof TOML.stringify>[0]),
      )

      await expect(
        new CatalogStore({
          configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        }).readCatalogs(),
      ).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('sorts Catalog and installed identities deterministically', async () => {
    const sandbox = await createSandbox()
    try {
      const store = new CatalogStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
      })
      await store.writeCatalogs([
        { ...catalog, name: 'zeta', catalog_id: 'zeta.catalog' },
        catalog,
      ])
      await store.writeInstalled([
        { ...installed, id: 'é.extension' },
        { ...installed, id: 'zeta.extension' },
        installed,
      ])
      expect((await store.readCatalogs()).map(({ name }) => name)).toEqual([
        'fixture',
        'zeta',
      ])
      expect((await store.readInstalled()).map(({ id }) => id)).toEqual([
        'fixture.extension',
        'zeta.extension',
        'é.extension',
      ])
    } finally {
      await sandbox.cleanup()
    }
  })
})
