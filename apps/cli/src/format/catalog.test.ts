import { expect, test } from 'bun:test'
import type {
  CatalogRecord,
  InstalledExtensionRecord,
} from '@ctxindex/core/catalog'
import { formatCatalog, formatInstalledExtension } from './catalog'

const catalog: CatalogRecord = {
  name: 'fixture',
  repository: '/tmp/fixture.git',
  ref: 'refs/heads/main',
  commit: 'a'.repeat(40),
  snapshot_acquired_at: 1_000,
  catalog_id: 'fixture.catalog',
  catalog_name: 'Fixture Catalog',
  extensions: [],
}

const installed: InstalledExtensionRecord = {
  id: 'fixture.extension',
  version: 1,
  catalog_name: 'fixture',
  catalog_id: 'fixture.catalog',
  repository: '/tmp/fixture.git',
  commit: 'a'.repeat(40),
  snapshot_acquired_at: 1_000,
  source_path: 'extension.ts',
}

test('Catalog output surfaces non-negative stored snapshot age', () => {
  expect(JSON.parse(formatCatalog(catalog, true, 4_000))).toMatchObject({
    snapshot_acquired_at: 1_000,
    snapshot_age_ms: 3_000,
  })
  expect(formatCatalog(catalog, false, 4_000)).toContain('Age: 3000ms')
  expect(
    JSON.parse(formatInstalledExtension('Installed', installed, true, 500)),
  ).toMatchObject({ snapshot_age_ms: 0 })
})
