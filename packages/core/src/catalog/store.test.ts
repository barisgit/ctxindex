import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as TOML from '@iarna/toml'
import { createSandbox } from '../testing'
import type { CatalogRecord } from './schema'
import { CatalogStore } from './store'

function catalog(
  name = 'fixture',
  catalogId = 'fixture.catalog',
): CatalogRecord {
  return {
    name,
    repository: `/tmp/${name}.git`,
    ref: 'refs/heads/main',
    commit: 'a'.repeat(40),
    snapshot_acquired_at: 1,
    catalog_id: catalogId,
    catalog_label: `${name} Catalog`,
    summary: `${name} summary`,
    generated: {
      packageName: `@example/${name}`,
      packageVersion: '1.0.0',
    },
    extensions: [
      {
        id: `${name}.extension`,
        summary: `${name} Extension`,
        source: {
          kind: 'package',
          replay: {
            source: {
              kind: 'npm',
              requestedTarget: `@example/${name}@^1`,
              package: `@example/${name}`,
              version: '1.2.3',
              integrity: 'sha512-fixture',
            },
            packageRoot: `node_modules/@example/${name}`,
            materializationDigest: 'b'.repeat(64),
            lock: {
              format: 'bun.lock@1.3.14',
              path: `resolutions/${name}.lock`,
              digest: 'c'.repeat(64),
              byteLength: 10,
            },
          },
        },
      },
    ],
  }
}

describe('CatalogStore schema-v2 configured state', () => {
  test('round-trips full inert records in deterministic Catalog-name order', async () => {
    const sandbox = await createSandbox()
    try {
      const store = new CatalogStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
      })
      const alpha = catalog('alpha', 'alpha.catalog')
      const zeta = catalog('zeta', 'zeta.catalog')

      await store.writeCatalogs([zeta, alpha])

      expect(await store.readCatalogs()).toEqual([alpha, zeta])
      const text = await Bun.file(store.catalogsPath).text()
      expect(text).toContain('schema_version = 2')
      expect(text).toContain('requestedTarget')
      expect(text).not.toContain('installed-extensions')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('returns empty state when no configured Catalog document exists', async () => {
    const sandbox = await createSandbox()
    try {
      expect(
        await new CatalogStore({
          configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        }).readCatalogs(),
      ).toEqual([])
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    { schema_version: 1, catalogs: [] },
    { schema_version: 2, catalogs: [], forbidden: true },
  ])('rejects non-v2 or open configured state: %#', async (document) => {
    const sandbox = await createSandbox()
    try {
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'catalogs.toml'),
        TOML.stringify(
          document as unknown as Parameters<typeof TOML.stringify>[0],
        ),
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

  test('rejects duplicate configured Catalog identities before writing', async () => {
    const sandbox = await createSandbox()
    try {
      const store = new CatalogStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
      })
      await expect(
        store.writeCatalogs([
          catalog('alpha', 'shared.catalog'),
          catalog('zeta', 'shared.catalog'),
        ]),
      ).rejects.toThrow('Duplicate Catalog id')
      expect(await Bun.file(store.catalogsPath).exists()).toBe(false)
    } finally {
      await sandbox.cleanup()
    }
  })
})
